from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LabelDefinition(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    label: str = Field(min_length=1, max_length=30)
    type: Literal["string", "number", "boolean", "enum"]
    options: list[str] = Field(default_factory=list, max_length=12)
    hint: str = Field(default="", max_length=80)


class ResolveTemplateRequest(BaseModel):
    item_name: str = Field(min_length=1, max_length=80)


class TemplateResponse(BaseModel):
    id: int
    display_name: str
    normalized_name: str
    labels: list[LabelDefinition]
    generation_source: str
    reused: bool


class CreateItemRequest(BaseModel):
    item_name: str = Field(min_length=1, max_length=80)
    template_id: int
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    description: str | None = Field(default=None, max_length=2000)
    attributes: dict[str, Any] = Field(default_factory=dict)
    image_object_keys: list[str] = Field(default_factory=list, max_length=3)


class UpdateItemRequest(BaseModel):
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    description: str | None = Field(default=None, max_length=2000)
    attributes: dict[str, Any] = Field(default_factory=dict)
    image_object_keys: list[str] = Field(default_factory=list, max_length=3)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    nickname: str = Field(min_length=1, max_length=40)
    phone: str = Field(pattern=r"^1\d{10}$")
    password: str = Field(min_length=6, max_length=72)

    @field_validator("username")
    @classmethod
    def username_must_not_have_spaces(cls, value: str) -> str:
        value = value.strip()
        if not value or any(char.isspace() for char in value):
            raise ValueError("用户名不能包含空格")
        return value.lower()


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=1, max_length=72)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    nickname: str
    phone: str | None
    avatar_url: str | None


class UpdateProfileRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=40)
    phone: str | None = Field(default=None, pattern=r"^1\d{10}$")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ImageResponse(BaseModel):
    object_key: str
    url: str
    sort_order: int


class ItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    seller_id: int
    item_name: str
    price: Decimal
    description: str | None
    attributes: dict[str, Any]
    status: str
    template_id: int
    attribute_labels: dict[str, str] = Field(default_factory=dict)
    label_definitions: list[LabelDefinition] = Field(default_factory=list)
    seller_nickname: str | None = None
    seller_avatar_url: str | None = None
    seller_completed_count: int = 0
    images: list[ImageResponse] = Field(default_factory=list)


class CreateCommentRequest(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class CommentResponse(BaseModel):
    id: int
    item_id: int
    content: str
    author_nickname: str
    author_avatar_url: str | None
    is_seller: bool
    is_author: bool
    created_at: str


class StartMatchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)


class ClarifyMatchRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=300)


class MatchSessionResponse(BaseModel):
    id: str
    status: Literal["needs_clarification", "completed"]
    question: str | None = None
    criteria: dict[str, Any] = Field(default_factory=dict)
    matched: list[dict[str, Any]] = Field(default_factory=list)
    uncertain: list[dict[str, Any]] = Field(default_factory=list)


class CreateReservationRequest(BaseModel):
    item_id: int
    agreed_price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    appointment_time: datetime
    location: str = Field(min_length=1, max_length=200)


class FailReservationRequest(BaseModel):
    failure_reason: str = Field(min_length=1, max_length=500)


class UpdateReservationRequest(BaseModel):
    appointment_time: datetime
    location: str = Field(min_length=1, max_length=200)


class ReservationResponse(BaseModel):
    id: int
    item_id: int
    agreed_price: Decimal
    appointment_time: datetime
    location: str
    status: str


class ReservationDetailResponse(ReservationResponse):
    role: Literal["buyer", "seller"]
    counterpart_nickname: str
    counterpart_phone: str | None
    failure_reason: str | None
    item: ItemResponse


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    content: str
    is_read: bool
    created_at: datetime


class CreateChatMessageRequest(BaseModel):
    item_id: int
    receiver_id: int
    content: str = Field(default="", max_length=1000)
    image_object_key: str | None = Field(default=None, max_length=300)


class ChatMessageResponse(BaseModel):
    id: int
    item_id: int
    sender_id: int
    sender_nickname: str
    sender_avatar_url: str | None
    content: str
    image_url: str | None
    created_at: datetime
    is_mine: bool


class ChatThreadResponse(BaseModel):
    item: ItemResponse
    peer_id: int
    peer_nickname: str
    peer_avatar_url: str | None
    latest_content: str
    latest_at: datetime
    unread_count: int = 0
