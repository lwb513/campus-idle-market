from __future__ import annotations

import os
import re
from typing import Any, Literal, TypedDict

from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .models import Item, ItemTemplate
from .services import item_response
from .template_generator import normalize_item_name


class CategoryPlan(BaseModel):
    category: str | None = None


class QueryFilter(BaseModel):
    field: str
    op: Literal["eq"] = "eq"
    value: str | float | bool


class QueryPlan(BaseModel):
    max_price: float | None = Field(default=None, ge=0)
    filters: list[QueryFilter] = Field(default_factory=list)
    unresolved: list[str] = Field(default_factory=list)


class MatchState(TypedDict, total=False):
    query: str
    category: str | None
    template_id: int | None
    max_price: float | None
    constraints: dict[str, Any]
    ambiguities: list[str]
    question: str
    candidate_ids: list[int]
    matched: list[dict[str, Any]]
    uncertain: list[dict[str, Any]]
    status: str


def _llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=os.getenv("MATCH_OPENAI_MODEL") or os.getenv("OPENAI_MODEL", "gpt-4o-mini"), api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        temperature=0, timeout=float(os.getenv("MATCH_LLM_TIMEOUT_SECONDS", "5")), max_retries=0,
    )


def _fallback_category(query: str, templates: list[ItemTemplate]) -> ItemTemplate | None:
    compact = normalize_item_name(query)
    return next((template for template in sorted(templates, key=lambda item: len(item.normalized_name), reverse=True) if template.normalized_name in compact), None)


def _fallback_plan(query: str, template: ItemTemplate) -> QueryPlan:
    price = re.search(r"(\d+(?:\.\d+)?)\s*(?:元)?\s*(?:以内|以下|不超过|最多)", query)
    filters: list[QueryFilter] = []
    compact = normalize_item_name(query)
    for label in template.labels:
        key, name, kind = label["key"], label["label"], label.get("type", "string")
        if normalize_item_name(name) not in compact:
            continue
        option = next((value for value in label.get("options", []) if normalize_item_name(value) in compact), None)
        if option is not None:
            filters.append(QueryFilter(field=key, value=option)); continue
        if kind == "boolean":
            filters.append(QueryFilter(field=key, value=not any(word in query for word in ("不", "无", "不要")))); continue
        value = re.search(re.escape(name) + r"\s*(?:为|是|:|：)?\s*([\w.+-]+)", query, flags=re.I)
        if value:
            try:
                filters.append(QueryFilter(field=key, value=float(value.group(1)) if kind == "number" else value.group(1)))
            except ValueError:
                pass
    keys = {label["key"] for label in template.labels}
    if "has_integrated_cable" in keys and any(word in query for word in ("带线", "自带线", "内置线")):
        filters.append(QueryFilter(field="has_integrated_cable", value=True))
    if "foldable" in keys and "折叠" in query:
        filters.append(QueryFilter(field="foldable", value=True))
    return QueryPlan(max_price=float(price.group(1)) if price else None, filters=filters)


async def _identify_category(query: str, templates: list[ItemTemplate]) -> ItemTemplate | None:
    fallback = _fallback_category(query, templates)
    if os.getenv("ENABLE_LLM_GENERATION", "false").lower() != "true" or not os.getenv("OPENAI_API_KEY"):
        return fallback
    try:
        result = CategoryPlan.model_validate(await _llm().with_structured_output(CategoryPlan).ainvoke(
            f"从需求中选一个类别；只能选列表里的值，不确定返回 null。类别：{[item.display_name for item in templates]}。需求：{query}"
        ))
        return next((item for item in templates if item.normalized_name == normalize_item_name(result.category or "")), fallback)
    except Exception:
        return fallback


async def _make_query_plan(query: str, template: ItemTemplate) -> QueryPlan:
    fallback = _fallback_plan(query, template)
    if os.getenv("ENABLE_LLM_GENERATION", "false").lower() != "true" or not os.getenv("OPENAI_API_KEY"):
        return fallback
    prompt = f"""生成查询计划，不写 SQL，不补全信息。
类别：{template.display_name}
可用标签：{template.labels}
只输出 max_price、filters(field 必须是标签 key，op 只能 eq，枚举值只能取 options) 和 unresolved。
需求：{query}"""
    try:
        planned = QueryPlan.model_validate(await _llm().with_structured_output(QueryPlan).ainvoke(prompt))
        # Price is simple and critical: always retain the deterministic extraction
        # when the model overlooks it.
        if planned.max_price is None:
            planned.max_price = fallback.max_price
        return planned
    except Exception:
        return fallback


def _validate_plan(plan: QueryPlan, template: ItemTemplate) -> tuple[float | None, dict[str, Any]]:
    definitions = {label["key"]: label for label in template.labels}
    constraints: dict[str, Any] = {}
    for condition in plan.filters:
        definition = definitions.get(condition.field)
        if not definition:
            continue
        kind, value = definition.get("type"), condition.value
        if kind == "boolean" and isinstance(value, bool):
            constraints[condition.field] = value
        elif kind == "number" and isinstance(value, (int, float)) and not isinstance(value, bool):
            constraints[condition.field] = value
        elif kind == "string" and isinstance(value, str) and value.strip():
            constraints[condition.field] = value.strip()
        elif kind == "enum":
            option = next((item for item in definition.get("options", []) if normalize_item_name(item) == normalize_item_name(str(value))), None)
            if option is not None:
                constraints[condition.field] = option
    return plan.max_price, constraints


def build_match_graph(db: Session, user_id: int):
    async def identify_category(state: MatchState) -> dict[str, Any]:
        template = await _identify_category(state["query"], list(db.scalars(select(ItemTemplate)).all()))
        if not template:
            return {"category": None, "template_id": None, "ambiguities": ["请确认您想购买的物品类型。"]}
        return {"category": template.display_name, "template_id": template.id, "ambiguities": []}

    def route_after_category(state: MatchState) -> str:
        return "clarify" if not state.get("template_id") else "make_query_plan"

    async def make_query_plan(state: MatchState) -> dict[str, Any]:
        template = db.get(ItemTemplate, state["template_id"])
        if not template:
            return {"ambiguities": ["该商品类别模板不存在，请重新输入。"]}
        plan = await _make_query_plan(state["query"], template)
        max_price, constraints = _validate_plan(plan, template)
        return {"max_price": max_price, "constraints": constraints, "ambiguities": plan.unresolved}

    def route_after_plan(state: MatchState) -> str:
        return "clarify" if state.get("ambiguities") else "search"

    def clarify(state: MatchState) -> dict[str, Any]:
        return {"status": "needs_clarification", "question": state.get("ambiguities", ["请补充商品类别。"])[0], "matched": [], "uncertain": []}

    def search(state: MatchState) -> dict[str, Any]:
        statement = select(Item).options(selectinload(Item.template), selectinload(Item.images)).where(
            Item.status == "on_sale", Item.seller_id != user_id, Item.template_id == state["template_id"]
        )
        if state.get("max_price") is not None:
            statement = statement.where(Item.price <= state["max_price"])
        return {"candidate_ids": [item.id for item in db.scalars(statement).all()]}

    def evaluate(state: MatchState) -> dict[str, Any]:
        ids = state.get("candidate_ids", [])
        if not ids:
            return {"matched": [], "uncertain": []}
        items = list(db.scalars(select(Item).options(selectinload(Item.template), selectinload(Item.images)).where(Item.id.in_(ids))).all())
        matched: list[dict[str, Any]] = []
        uncertain: list[dict[str, Any]] = []
        for item in items:
            labels = {label["key"]: label["label"] for label in item.template.labels}
            reasons, unknown, conflict = [], [], False
            if state.get("max_price") is not None:
                reasons.append(f"价格 ¥{item.price} 不超过预算 ¥{state['max_price']:g}")
            for key, expected in state.get("constraints", {}).items():
                actual, label = item.attributes.get(key), labels.get(key, key)
                if actual is None:
                    unknown.append(label)
                elif actual != expected:
                    conflict = True; break
                else:
                    value = "是" if actual is True else "否" if actual is False else str(actual)
                    reasons.append(f"{label}：{value}")
            if not conflict:
                result = {"item": item_response(item).model_dump(mode="json"), "reasons": reasons, "unknown_fields": unknown}
                (uncertain if unknown else matched).append(result)
        return {"matched": matched, "uncertain": uncertain}

    def finish(_: MatchState) -> dict[str, Any]:
        return {"status": "completed", "question": ""}

    graph = StateGraph(MatchState)
    graph.add_node("identify_category", identify_category)
    graph.add_node("make_query_plan", make_query_plan)
    graph.add_node("clarify", clarify)
    graph.add_node("search", search)
    graph.add_node("evaluate", evaluate)
    graph.add_node("finish", finish)
    graph.add_edge(START, "identify_category")
    graph.add_conditional_edges("identify_category", route_after_category, {"clarify": "clarify", "make_query_plan": "make_query_plan"})
    graph.add_edge("clarify", END)
    graph.add_conditional_edges("make_query_plan", route_after_plan, {"clarify": "clarify", "search": "search"})
    graph.add_edge("search", "evaluate")
    graph.add_edge("evaluate", "finish")
    graph.add_edge("finish", END)
    return graph.compile()
