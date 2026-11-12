from __future__ import annotations

from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session, selectinload

from .auth import create_access_token, get_current_user, hash_password, verify_password
from .database import Base, SessionLocal, engine, get_db
from .matcher import build_match_graph
from .models import ChatMessage, Favorite, Item, ItemComment, ItemTemplate, MatchSession, Notification, Reservation, User
from .schemas import ChatMessageResponse, ChatThreadResponse, ClarifyMatchRequest, CommentResponse, CreateChatMessageRequest, CreateCommentRequest, CreateItemRequest, CreateReservationRequest, FailReservationRequest, ItemResponse, LoginRequest, MatchSessionResponse, NotificationResponse, RegisterRequest, ReservationDetailResponse, ReservationResponse, ResolveTemplateRequest, StartMatchRequest, TemplateResponse, TokenResponse, UpdateItemRequest, UpdateProfileRequest, UpdateReservationRequest, UserResponse
from .services import create_item, get_seller_items, get_template_by_name, item_response, update_off_shelf_item
from .storage import read_item_image, upload_avatar_image, upload_item_image
from .template_generator import TemplateGenerator, normalize_item_name


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    if "avatar_object_key" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN avatar_object_key VARCHAR(300)"))
    if "phone" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(20)"))
    reservation_columns = {column["name"] for column in inspect(engine).get_columns("reservations")}
    if "failure_reason" not in reservation_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE reservations ADD COLUMN failure_reason TEXT"))
    chat_columns = {column["name"] for column in inspect(engine).get_columns("chat_messages")}
    if "image_object_key" not in chat_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE chat_messages ADD COLUMN image_object_key VARCHAR(300)"))
    if "is_read" not in chat_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE chat_messages ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE"))
    # Older fallback templates were the same generic three labels for every item.
    # Upgrade the known category templates while retaining brand/model/condition keys.
    with SessionLocal() as db:
        generic_keys = {"brand", "model", "condition"}
        changed = False
        for template in db.scalars(select(ItemTemplate).where(ItemTemplate.generation_source == "fallback")).all():
            if {label.get("key") for label in template.labels} != generic_keys:
                continue
            upgraded = TemplateGenerator._fallback(template.display_name)
            if len(upgraded) > len(template.labels):
                template.labels = [label.model_dump() for label in upgraded]
                changed = True
        if changed:
            db.commit()
    yield


app = FastAPI(title="校园闲置物品智能交易平台", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
generator = TemplateGenerator()


def notify(db: Session, user_id: int, title: str, content: str) -> None:
    db.add(Notification(user_id=user_id, title=title, content=content))


def match_session_response(session: MatchSession) -> MatchSessionResponse:
    state = session.state or {}
    return MatchSessionResponse(
        id=session.id,
        status=session.status,
        question=state.get("question") or None,
        criteria={"item_name": state.get("category"), "max_price": state.get("max_price"), "constraints": state.get("constraints", {})},
        matched=state.get("matched", []),
        uncertain=state.get("uncertain", []),
    )


@app.get("/api/v1/health")
def health():
    return {"ok": True}


@app.post("/api/v1/auth/register", response_model=TokenResponse, status_code=201)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == request.username)):
        raise HTTPException(status_code=409, detail="该用户名已被注册")
    if db.scalar(select(User).where(User.phone == request.phone)):
        raise HTTPException(status_code=409, detail="该手机号已被注册")
    user = User(username=request.username, nickname=request.nickname.strip(), phone=request.phone, password_hash=hash_password(request.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user), user=user)


@app.post("/api/v1/auth/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == request.username.strip().lower()))
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return TokenResponse(access_token=create_access_token(user), user=user)


@app.get("/api/v1/auth/me", response_model=UserResponse)
def current_user(current: User = Depends(get_current_user)):
    return current


@app.get("/api/v1/notifications", response_model=list[NotificationResponse])
def my_notifications(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    return list(db.scalars(select(Notification).where(Notification.user_id == current.id, Notification.title != "收到新的聊天消息").order_by(Notification.created_at.desc())).all())


@app.post("/api/v1/notifications/read-all", status_code=204)
def read_all_notifications(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    for notification in db.scalars(select(Notification).where(Notification.user_id == current.id, Notification.is_read.is_(False))).all():
        notification.is_read = True
    db.commit()


@app.post("/api/v1/notifications/{notification_id}/read", status_code=204)
def read_notification(notification_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != current.id:
        raise HTTPException(status_code=404, detail="通知不存在")
    if not notification.is_read:
        notification.is_read = True
        db.commit()


def chat_message_response(message: ChatMessage, current: User, db: Session) -> ChatMessageResponse:
    sender = db.get(User, message.sender_id)
    image_url = f"/api/v1/files/{message.image_object_key}" if message.image_object_key else None
    return ChatMessageResponse(id=message.id, item_id=message.item_id, sender_id=message.sender_id, sender_nickname=sender.nickname if sender else "校园用户", sender_avatar_url=sender.avatar_url if sender else None, content=message.content, image_url=image_url, created_at=message.created_at, is_mine=message.sender_id == current.id)


@app.get("/api/v1/chat/threads", response_model=list[ChatThreadResponse])
def chat_threads(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    messages = db.scalars(select(ChatMessage).where((ChatMessage.sender_id == current.id) | (ChatMessage.receiver_id == current.id)).order_by(ChatMessage.created_at.desc())).all()
    threads: list[ChatThreadResponse] = []
    seen: set[tuple[int, int]] = set()
    for message in messages:
        peer_id = message.receiver_id if message.sender_id == current.id else message.sender_id
        key = (message.item_id, peer_id)
        if key in seen:
            continue
        item, peer = db.get(Item, message.item_id), db.get(User, peer_id)
        if item and peer:
            unread_count = db.scalar(select(func.count(ChatMessage.id)).where(ChatMessage.item_id == item.id, ChatMessage.sender_id == peer.id, ChatMessage.receiver_id == current.id, ChatMessage.is_read.is_(False))) or 0
            threads.append(ChatThreadResponse(item=item_response(item, db), peer_id=peer.id, peer_nickname=peer.nickname, peer_avatar_url=peer.avatar_url, latest_content=message.content or "[图片]", latest_at=message.created_at, unread_count=unread_count))
        seen.add(key)
    return threads


@app.get("/api/v1/chat/items/{item_id}/with/{peer_id}", response_model=list[ChatMessageResponse])
def chat_messages(item_id: int, peer_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    messages = db.scalars(select(ChatMessage).where(ChatMessage.item_id == item_id, ((ChatMessage.sender_id == current.id) & (ChatMessage.receiver_id == peer_id)) | ((ChatMessage.sender_id == peer_id) & (ChatMessage.receiver_id == current.id))).order_by(ChatMessage.created_at.asc())).all()
    changed = False
    for message in messages:
        if message.receiver_id == current.id and not message.is_read:
            message.is_read = True
            changed = True
    if changed:
        db.commit()
    return [chat_message_response(message, current, db) for message in messages]


@app.post("/api/v1/chat/messages", response_model=ChatMessageResponse, status_code=201)
def send_chat_message(request: CreateChatMessageRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = db.get(Item, request.item_id)
    if not item or not db.get(User, request.receiver_id):
        raise HTTPException(status_code=404, detail="商品或聊天对象不存在")
    if request.receiver_id == current.id:
        raise HTTPException(status_code=422, detail="不能给自己发送消息")
    if not request.content.strip() and not request.image_object_key:
        raise HTTPException(status_code=422, detail="消息内容和图片不能同时为空")
    if request.image_object_key and (not request.image_object_key.startswith(f"items/{current.id}/") or ".." in request.image_object_key):
        raise HTTPException(status_code=422, detail="聊天图片对象键不合法")
    if current.id != item.seller_id and request.receiver_id != item.seller_id:
        raise HTTPException(status_code=403, detail="只能就该商品联系卖家")
    message = ChatMessage(item_id=item.id, sender_id=current.id, receiver_id=request.receiver_id, content=request.content.strip(), image_object_key=request.image_object_key)
    db.add(message)
    db.commit()
    db.refresh(message)
    return chat_message_response(message, current, db)


@app.post("/api/v1/match/sessions", response_model=MatchSessionResponse, status_code=201)
async def start_match(request: StartMatchRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    state = await build_match_graph(db, current.id).ainvoke({"query": request.query.strip()})
    session = MatchSession(
        id=str(uuid4()),
        user_id=current.id,
        query=request.query.strip(),
        state=dict(state),
        status=state["status"],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return match_session_response(session)


@app.post("/api/v1/match/sessions/{session_id}/clarify", response_model=MatchSessionResponse)
async def clarify_match(session_id: str, request: ClarifyMatchRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    session = db.get(MatchSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="匹配会话不存在")
    if session.user_id != current.id:
        raise HTTPException(status_code=403, detail="无权继续此匹配会话")
    if session.status != "needs_clarification":
        raise HTTPException(status_code=409, detail="该匹配会话无需补充信息")
    combined_query = f"{session.query}\n补充信息：{request.answer.strip()}"
    state = await build_match_graph(db, current.id).ainvoke({"query": combined_query})
    session.query = combined_query
    session.state = dict(state)
    session.status = state["status"]
    db.commit()
    db.refresh(session)
    return match_session_response(session)


@app.post("/api/v1/reservations", response_model=ReservationResponse, status_code=201)
def create_reservation(request: CreateReservationRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = db.get(Item, request.item_id)
    if not item or item.status != "on_sale":
        raise HTTPException(status_code=409, detail="该商品当前无法预约")
    if item.seller_id == current.id:
        raise HTTPException(status_code=403, detail="不能预约自己发布的商品")
    existing = db.scalar(select(Reservation).where(Reservation.item_id == item.id, Reservation.buyer_id == current.id, Reservation.status == "pending"))
    if existing:
        raise HTTPException(status_code=409, detail="您已提交过该商品的预约，请等待卖家处理")
    reservation = Reservation(
        item_id=item.id,
        buyer_id=current.id,
        seller_id=item.seller_id,
        agreed_price=request.agreed_price,
        appointment_time=request.appointment_time,
        location=request.location.strip(),
    )
    db.add(reservation)
    notify(db, item.seller_id, "收到新的预约", f"{current.nickname} 希望预约你的商品「{item.item_name}」。")
    db.commit()
    db.refresh(reservation)
    return reservation


def reservation_detail_response(reservation: Reservation, db: Session, current: User) -> ReservationDetailResponse:
    item = db.get(Item, reservation.item_id)
    counterpart = db.get(User, reservation.seller_id if reservation.buyer_id == current.id else reservation.buyer_id)
    return ReservationDetailResponse(
        id=reservation.id,
        item_id=reservation.item_id,
        agreed_price=reservation.agreed_price,
        appointment_time=reservation.appointment_time,
        location=reservation.location,
        status=reservation.status,
        role="buyer" if reservation.buyer_id == current.id else "seller",
        counterpart_nickname=counterpart.nickname if counterpart else "未知用户",
        counterpart_phone=counterpart.phone if counterpart else None,
        failure_reason=reservation.failure_reason,
        item=item_response(item, db),
    )


@app.get("/api/v1/reservations/mine", response_model=list[ReservationDetailResponse])
def my_reservations(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    reservations = db.scalars(select(Reservation).where((Reservation.buyer_id == current.id) | (Reservation.seller_id == current.id)).order_by(Reservation.created_at.desc())).all()
    return [reservation_detail_response(reservation, db, current) for reservation in reservations]


@app.post("/api/v1/reservations/{reservation_id}/confirm", response_model=ReservationResponse)
def confirm_reservation(reservation_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    reservation = db.get(Reservation, reservation_id)
    if not reservation or reservation.seller_id != current.id:
        raise HTTPException(status_code=404, detail="预约单不存在")
    if reservation.status != "pending":
        raise HTTPException(status_code=409, detail="该预约单当前不能确认")
    item = db.get(Item, reservation.item_id)
    if not item or item.status != "on_sale":
        raise HTTPException(status_code=409, detail="商品已无法确认预约")
    reservation.status = "confirmed"
    item.status = "reserved"
    notify(db, reservation.buyer_id, "预约已确认", f"卖家已确认「{item.item_name}」的线下交接预约。")
    other_pending = db.scalars(select(Reservation).where(Reservation.item_id == item.id, Reservation.id != reservation.id, Reservation.status == "pending")).all()
    for other in other_pending:
        other.status = "rejected"
    db.commit()
    db.refresh(reservation)
    return reservation


@app.post("/api/v1/reservations/{reservation_id}/reject", response_model=ReservationResponse)
def reject_reservation(reservation_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    reservation = db.get(Reservation, reservation_id)
    if not reservation or reservation.seller_id != current.id:
        raise HTTPException(status_code=404, detail="预约单不存在")
    if reservation.status != "pending":
        raise HTTPException(status_code=409, detail="该预约单当前不能拒绝")
    reservation.status = "rejected"
    notify(db, reservation.buyer_id, "预约被拒绝", f"卖家拒绝了「{db.get(Item, reservation.item_id).item_name}」的预约。")
    db.commit()
    db.refresh(reservation)
    return reservation


@app.post("/api/v1/reservations/{reservation_id}/cancel", response_model=ReservationResponse)
def cancel_reservation(reservation_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    reservation = db.get(Reservation, reservation_id)
    if not reservation or reservation.buyer_id != current.id:
        raise HTTPException(status_code=404, detail="预约单不存在")
    if reservation.status not in {"pending", "confirmed"}:
        raise HTTPException(status_code=409, detail="该预约单当前不能取消")
    if reservation.status == "confirmed":
        item = db.get(Item, reservation.item_id)
        if item:
            item.status = "on_sale"
    reservation.status = "cancelled"
    notify(db, reservation.seller_id, "预约已取消", f"买家取消了「{db.get(Item, reservation.item_id).item_name}」的预约。")
    db.commit()
    db.refresh(reservation)
    return reservation


@app.post("/api/v1/reservations/{reservation_id}/complete", response_model=ReservationResponse)
def complete_reservation(reservation_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    reservation = db.get(Reservation, reservation_id)
    if not reservation or reservation.buyer_id != current.id:
        raise HTTPException(status_code=404, detail="预约单不存在")
    if reservation.status != "confirmed":
        raise HTTPException(status_code=409, detail="只有已确认的预约才能确认交易成功")
    item = db.get(Item, reservation.item_id)
    if not item or item.status != "reserved":
        raise HTTPException(status_code=409, detail="商品当前状态无法完成交易")
    reservation.status = "buyer_completed"
    notify(db, reservation.seller_id, "买家确认交易成功", f"买家已确认「{item.item_name}」交易成功，等待你最终确认。")
    db.commit()
    db.refresh(reservation)
    return reservation


@app.post("/api/v1/reservations/{reservation_id}/complete-confirm", response_model=ReservationResponse)
def confirm_complete_reservation(reservation_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    reservation = db.get(Reservation, reservation_id)
    if not reservation or reservation.seller_id != current.id:
        raise HTTPException(status_code=404, detail="预约单不存在")
    if reservation.status != "buyer_completed":
        raise HTTPException(status_code=409, detail="买家尚未确认交易成功")
    item = db.get(Item, reservation.item_id)
    if not item or item.status != "reserved":
        raise HTTPException(status_code=409, detail="商品当前状态无法完成交易")
    reservation.status = "completed"
    item.status = "sold"
    notify(db, reservation.buyer_id, "交易已完成", f"卖家已确认「{item.item_name}」交易完成，商品已售出。")
    db.commit()
    db.refresh(reservation)
    return reservation


@app.post("/api/v1/reservations/{reservation_id}/fail", response_model=ReservationResponse)
def fail_reservation(reservation_id: int, request: FailReservationRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    reservation = db.get(Reservation, reservation_id)
    if not reservation or reservation.buyer_id != current.id:
        raise HTTPException(status_code=404, detail="预约单不存在")
    if reservation.status != "confirmed":
        raise HTTPException(status_code=409, detail="只有已确认的预约才能标记交易失败")
    item = db.get(Item, reservation.item_id)
    if not item or item.status != "reserved":
        raise HTTPException(status_code=409, detail="商品当前状态无法终止交易")
    reservation.status = "failed"
    reservation.failure_reason = request.failure_reason.strip()
    item.status = "on_sale"
    notify(db, reservation.seller_id, "交易未完成", f"「{item.item_name}」交易失败，原因：{reservation.failure_reason}。商品已恢复在售。")
    db.commit()
    db.refresh(reservation)
    return reservation


@app.patch("/api/v1/reservations/{reservation_id}", response_model=ReservationResponse)
def update_reservation(reservation_id: int, request: UpdateReservationRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    reservation = db.get(Reservation, reservation_id)
    if not reservation or current.id not in {reservation.buyer_id, reservation.seller_id}:
        raise HTTPException(status_code=404, detail="预约单不存在")
    if reservation.status not in {"pending", "confirmed"}:
        raise HTTPException(status_code=409, detail="该预约单当前不能修改")
    item = db.get(Item, reservation.item_id)
    reservation.appointment_time = request.appointment_time
    reservation.location = request.location.strip()
    reservation.status = "pending"
    if item and item.status == "reserved":
        item.status = "on_sale"
    counterpart_id = reservation.seller_id if current.id == reservation.buyer_id else reservation.buyer_id
    notify(db, counterpart_id, "预约信息已修改", f"「{item.item_name if item else '商品'}」的交接时间或地点已修改，请重新确认预约。")
    db.commit()
    db.refresh(reservation)
    return reservation


@app.patch("/api/v1/auth/me", response_model=UserResponse)
def update_current_user(request: UpdateProfileRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    current.nickname = request.nickname.strip()
    if request.phone is not None:
        phone_owner = db.scalar(select(User).where(User.phone == request.phone, User.id != current.id))
        if phone_owner:
            raise HTTPException(status_code=409, detail="该手机号已被其他账户使用")
        current.phone = request.phone
    db.commit()
    db.refresh(current)
    return current


@app.post("/api/v1/auth/me/avatar", response_model=UserResponse)
async def update_avatar(file: UploadFile = File(...), db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    object_key, _ = await upload_avatar_image(file, current.id)
    current.avatar_object_key = object_key
    db.commit()
    db.refresh(current)
    return current


@app.post("/api/v1/publish/templates/resolve", response_model=TemplateResponse)
async def resolve_template(request: ResolveTemplateRequest, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    existing = get_template_by_name(db, request.item_name)
    if existing:
        return TemplateResponse.model_validate({**existing.__dict__, "reused": True})

    try:
        labels, source = await generator.generate(request.item_name)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"标签模板生成失败：{exc}") from exc
    template = ItemTemplate(
        display_name=request.item_name.strip(),
        normalized_name=normalize_item_name(request.item_name),
        labels=[label.model_dump() for label in labels],
        generation_source=source,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return TemplateResponse.model_validate({**template.__dict__, "reused": False})


@app.post("/api/v1/items", response_model=ItemResponse, status_code=201)
def publish_item(request: CreateItemRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    return item_response(create_item(db, request, current.id))


@app.get("/api/v1/items/mine", response_model=list[ItemResponse])
def my_on_sale_items(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    return [item_response(item, db) for item in get_seller_items(db, current.id)]


@app.post("/api/v1/items/{item_id}/favorite", status_code=204)
def favorite_item(item_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="商品不存在")
    if item.seller_id == current.id:
        raise HTTPException(status_code=403, detail="不能收藏自己发布的商品")
    if not db.scalar(select(Favorite).where(Favorite.user_id == current.id, Favorite.item_id == item_id)):
        db.add(Favorite(user_id=current.id, item_id=item_id))
        db.commit()


@app.delete("/api/v1/items/{item_id}/favorite", status_code=204)
def unfavorite_item(item_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    favorite = db.scalar(select(Favorite).where(Favorite.user_id == current.id, Favorite.item_id == item_id))
    if favorite:
        db.delete(favorite)
        db.commit()


@app.get("/api/v1/favorites", response_model=list[ItemResponse])
def my_favorites(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    statement = select(Item).join(Favorite, Favorite.item_id == Item.id).options(selectinload(Item.images), selectinload(Item.template)).where(Favorite.user_id == current.id).order_by(Favorite.created_at.desc())
    return [item_response(item, db) for item in db.scalars(statement).all()]


def owned_item_or_404(item_id: int, db: Session, current: User) -> Item:
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="商品不存在")
    if item.seller_id != current.id:
        raise HTTPException(status_code=403, detail="只能管理自己发布的商品")
    return item


@app.post("/api/v1/items/{item_id}/off-shelf", response_model=ItemResponse)
def off_shelf_item(item_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = owned_item_or_404(item_id, db, current)
    if item.status != "on_sale":
        raise HTTPException(status_code=409, detail="只有在售商品可以下架")
    item.status = "off_shelf"
    db.commit()
    db.refresh(item)
    return item_response(item, db)


@app.post("/api/v1/items/{item_id}/on-sale", response_model=ItemResponse)
def put_item_on_sale(item_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = owned_item_or_404(item_id, db, current)
    if item.status != "off_shelf":
        raise HTTPException(status_code=409, detail="只有已下架商品可以重新上架")
    item.status = "on_sale"
    db.commit()
    db.refresh(item)
    return item_response(item, db)


@app.patch("/api/v1/items/{item_id}", response_model=ItemResponse)
def update_item(item_id: int, request: UpdateItemRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = owned_item_or_404(item_id, db, current)
    return item_response(update_off_shelf_item(db, item, request), db)


@app.delete("/api/v1/items/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = owned_item_or_404(item_id, db, current)
    if item.status != "off_shelf":
        raise HTTPException(status_code=409, detail="请先下架商品后再删除")
    active_reservation = db.scalar(
        select(Reservation).where(
            Reservation.item_id == item.id,
            Reservation.status.in_({"pending", "confirmed"}),
        )
    )
    if active_reservation:
        raise HTTPException(status_code=409, detail="该商品仍有进行中的预约，暂时不能删除")
    db.delete(item)
    db.commit()


@app.get("/api/v1/items/{item_id}", response_model=ItemResponse)
def get_item_detail(item_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="商品不存在")
    return item_response(item, db)


@app.get("/api/v1/items/{item_id}/comments", response_model=list[CommentResponse])
def get_item_comments(item_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="商品不存在")
    comments = db.scalars(select(ItemComment).where(ItemComment.item_id == item_id).order_by(ItemComment.created_at.desc())).all()
    return [CommentResponse(id=comment.id, item_id=comment.item_id, content=comment.content, author_nickname=comment.author.nickname, author_avatar_url=comment.author.avatar_url, is_seller=comment.author_id == item.seller_id, is_author=comment.author_id == current.id, created_at=comment.created_at.isoformat()) for comment in comments]


@app.post("/api/v1/items/{item_id}/comments", response_model=CommentResponse, status_code=201)
def create_item_comment(item_id: int, request: CreateCommentRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="商品不存在")
    comment = ItemComment(item_id=item_id, author_id=current.id, content=request.content.strip())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return CommentResponse(id=comment.id, item_id=comment.item_id, content=comment.content, author_nickname=current.nickname, author_avatar_url=current.avatar_url, is_seller=current.id == item.seller_id, is_author=True, created_at=comment.created_at.isoformat())


@app.delete("/api/v1/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    comment = db.get(ItemComment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="评论不存在")
    if comment.author_id != current.id:
        raise HTTPException(status_code=403, detail="只能删除自己的评论")
    db.delete(comment)
    db.commit()


@app.post("/api/v1/uploads/images")
async def upload_image(file: UploadFile = File(...), current: User = Depends(get_current_user)):
    object_key, content_type = await upload_item_image(file, current.id)
    return {"object_key": object_key, "content_type": content_type, "url": f"/api/v1/files/{object_key}"}


@app.get("/api/v1/files/{object_key:path}")
def get_image(object_key: str):
    content, content_type = read_item_image(object_key)
    return Response(content=content, media_type=content_type)
