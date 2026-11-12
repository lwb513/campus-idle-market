from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .models import Item, ItemImage, ItemTemplate, User
from .schemas import CreateItemRequest, ItemResponse, LabelDefinition, UpdateItemRequest
from .template_generator import normalize_item_name


def get_template_by_name(db: Session, item_name: str) -> ItemTemplate | None:
    return db.scalar(select(ItemTemplate).where(ItemTemplate.normalized_name == normalize_item_name(item_name)))


def validate_attributes(labels: list[dict], attributes: dict[str, Any]) -> dict[str, Any]:
    definitions = {label["key"]: LabelDefinition.model_validate(label) for label in labels}
    unknown = set(attributes) - set(definitions)
    if unknown:
        raise HTTPException(status_code=422, detail=f"存在不属于该模板的标签：{', '.join(sorted(unknown))}")

    validated: dict[str, Any] = {}
    for key, value in attributes.items():
        if value is None or value == "":
            continue
        definition = definitions[key]
        if definition.type == "boolean" and not isinstance(value, bool):
            raise HTTPException(status_code=422, detail=f"标签 {definition.label} 必须是布尔值")
        if definition.type == "number" and (isinstance(value, bool) or not isinstance(value, (int, float, Decimal))):
            raise HTTPException(status_code=422, detail=f"标签 {definition.label} 必须是数字")
        if definition.type == "string" and not isinstance(value, str):
            raise HTTPException(status_code=422, detail=f"标签 {definition.label} 必须是文本")
        if definition.type == "enum" and value not in definition.options:
            raise HTTPException(status_code=422, detail=f"标签 {definition.label} 的值不合法")
        validated[key] = value
    return validated


def create_item(db: Session, request: CreateItemRequest, seller_id: int) -> Item:
    template = db.get(ItemTemplate, request.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="发布模板不存在，请重新确认物品名称")
    if template.normalized_name != normalize_item_name(request.item_name):
        raise HTTPException(status_code=422, detail="物品名称与所选模板不一致，请重新生成模板")

    item = Item(
        seller_id=seller_id,
        item_name=request.item_name.strip(),
        price=request.price,
        description=request.description.strip() if request.description else None,
        attributes=validate_attributes(template.labels, request.attributes),
        template_id=template.id,
    )
    for index, object_key in enumerate(request.image_object_keys):
        if not object_key.startswith(f"items/{seller_id}/") or ".." in object_key:
            raise HTTPException(status_code=422, detail="图片对象键不合法")
        item.images.append(ItemImage(object_key=object_key, content_type="image/*", sort_order=index))
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def item_response(item: Item, db: Session | None = None) -> ItemResponse:
    attribute_labels = {label["key"]: label["label"] for label in item.template.labels}
    seller = db.get(User, item.seller_id) if db else None
    completed_count = 0
    if db:
        completed_count = db.scalar(select(func.count(Item.id)).where(Item.seller_id == item.seller_id, Item.status == "sold")) or 0
    return ItemResponse(
        id=item.id,
        seller_id=item.seller_id,
        item_name=item.item_name,
        price=item.price,
        description=item.description,
        attributes=item.attributes,
        status=item.status,
        template_id=item.template_id,
        attribute_labels=attribute_labels,
        label_definitions=item.template.labels,
        seller_nickname=seller.nickname if seller else None,
        seller_avatar_url=seller.avatar_url if seller else None,
        seller_completed_count=completed_count,
        images=[{"object_key": image.object_key, "url": f"/api/v1/files/{image.object_key}", "sort_order": image.sort_order} for image in item.images],
    )


def get_seller_items(db: Session, seller_id: int) -> list[Item]:
    statement = (
        select(Item)
        .options(selectinload(Item.images), selectinload(Item.template))
        .where(Item.seller_id == seller_id)
        .order_by(Item.created_at.desc())
    )
    return list(db.scalars(statement).all())


def update_off_shelf_item(db: Session, item: Item, request: UpdateItemRequest) -> Item:
    if item.status != "off_shelf":
        raise HTTPException(status_code=409, detail="请先下架商品后再修改")
    item.price = request.price
    item.description = request.description.strip() if request.description else None
    item.attributes = validate_attributes(item.template.labels, request.attributes)
    item.images.clear()
    db.flush()
    for index, object_key in enumerate(request.image_object_keys):
        if not object_key.startswith(f"items/{item.seller_id}/") or ".." in object_key:
            raise HTTPException(status_code=422, detail="图片对象键不合法")
        item.images.append(ItemImage(object_key=object_key, content_type="image/*", sort_order=index))
    db.commit()
    db.refresh(item)
    return item
