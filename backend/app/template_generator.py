from __future__ import annotations

import os
import re
from typing import Any

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from .schemas import LabelDefinition


def normalize_item_name(name: str) -> str:
    return re.sub(r"\s+", "", name.strip().lower())


class GeneratedTemplate(BaseModel):
    labels: list[LabelDefinition] = Field(description="3 到 6 个供卖家选填的标签定义")


class TemplateGenerator:
    """Generates reusable, optional label definitions; it never creates facts for an item."""

    async def generate(self, item_name: str) -> tuple[list[LabelDefinition], str]:
        api_key = os.getenv("OPENAI_API_KEY")
        llm_enabled = os.getenv("ENABLE_LLM_GENERATION", "false").lower() == "true"
        if llm_enabled and api_key:
            try:
                labels = await self._generate_with_model(item_name, api_key)
                return labels, "llm"
            except Exception:
                # A slow or unavailable model must not block publishing forever.
                return self._fallback(item_name), "fallback"
        return self._fallback(item_name), "fallback"

    async def _generate_with_model(self, item_name: str, api_key: str) -> list[LabelDefinition]:
        prompt = f"""为校园二手平台生成 3-5 个“可筛选、可选填”的商品标签。不要价格、名称、描述、品牌；不要编造商品事实。
格式：key=英文 snake_case；label=中文；type=string|number|boolean|enum；只有 enum 有 options；hint 简短。
示例1：充电宝 → capacity_mah/容量/number，has_integrated_cable/是否自带线/boolean，interface/接口/enum[Type-C,Lightning,Micro USB,多接口]。
示例2：桌子 → size_cm/尺寸/string，foldable/是否折叠/boolean，material/材质/enum[木质,金属,塑料,其他]。
现在的物品：{item_name}"""
        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        model = os.getenv("TEMPLATE_OPENAI_MODEL") or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        llm = ChatOpenAI(model=model, api_key=api_key, base_url=base_url, temperature=0, timeout=float(os.getenv("TEMPLATE_LLM_TIMEOUT_SECONDS", "45")), max_retries=0)
        structured_llm = llm.with_structured_output(GeneratedTemplate)
        result: Any = await structured_llm.ainvoke(prompt)
        parsed = GeneratedTemplate.model_validate(result)
        return self._validate_labels(parsed.labels)

    @staticmethod
    def _validate_labels(labels: list[LabelDefinition]) -> list[LabelDefinition]:
        if not 3 <= len(labels) <= 6 or len({label.key for label in labels}) != len(labels):
            raise ValueError("模型生成的标签数量或键名不符合要求")
        for label in labels:
            if label.type == "enum" and not label.options:
                raise ValueError("枚举标签缺少选项")
            if label.type != "enum" and label.options:
                raise ValueError("非枚举标签不能携带选项")
        return labels

    @staticmethod
    def _fallback(item_name: str) -> list[LabelDefinition]:
        name = normalize_item_name(item_name)
        if "显示器" in name or "monitor" in name:
            return [
                LabelDefinition(key="brand", label="品牌", type="string", hint="例如：AOC、戴尔"),
                LabelDefinition(key="model", label="型号", type="string", hint="例如：24G2"),
                LabelDefinition(key="screen_size_inch", label="屏幕尺寸", type="number", hint="例如：24（英寸）"),
                LabelDefinition(key="resolution", label="分辨率", type="enum", options=["1080P", "2K", "4K", "其他"], hint=""),
                LabelDefinition(key="refresh_rate_hz", label="刷新率", type="enum", options=["60Hz", "75Hz", "144Hz", "165Hz", "其他"], hint=""),
                LabelDefinition(key="condition", label="成色", type="enum", options=["全新", "近全新", "轻微使用", "明显使用痕迹"], hint=""),
            ]
        if "耳机" in name or "headphone" in name or "headset" in name:
            return [
                LabelDefinition(key="brand", label="品牌", type="string", hint="例如：索尼、漫步者"),
                LabelDefinition(key="model", label="型号", type="string", hint="不知道可不填"),
                LabelDefinition(key="connection_type", label="连接方式", type="enum", options=["有线", "蓝牙", "2.4G", "有线+蓝牙"], hint=""),
                LabelDefinition(key="wearing_style", label="佩戴类型", type="enum", options=["入耳式", "半入耳式", "头戴式", "耳挂式"], hint=""),
                LabelDefinition(key="noise_cancellation", label="降噪功能", type="boolean", hint=""),
                LabelDefinition(key="condition", label="成色", type="enum", options=["全新", "近全新", "轻微使用", "明显使用痕迹"], hint=""),
            ]
        if "充电宝" in name or "移动电源" in name:
            return [
                LabelDefinition(key="capacity_mah", label="容量", type="number", hint="例如：10000（mAh）"),
                LabelDefinition(key="interface", label="接口", type="enum", options=["Type-C", "Lightning", "Micro USB", "多接口"], hint="可多选时请在描述说明"),
                LabelDefinition(key="has_integrated_cable", label="是否自带线", type="boolean", hint="内置或一体式充电线"),
                LabelDefinition(key="fast_charge", label="是否支持快充", type="boolean", hint=""),
                LabelDefinition(key="condition", label="成色", type="enum", options=["全新", "近全新", "轻微使用", "明显使用痕迹"], hint=""),
            ]
        return [
            LabelDefinition(key="brand", label="品牌", type="string", hint="不知道可不填"),
            LabelDefinition(key="model", label="型号", type="string", hint="不知道可不填"),
            LabelDefinition(key="condition", label="成色", type="enum", options=["全新", "近全新", "轻微使用", "明显使用痕迹"], hint=""),
        ]
