import os

os.environ["DATABASE_URL"] = "sqlite:///./test_campus_market.db"
os.environ["ENABLE_LLM_GENERATION"] = "false"

from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post("/api/v1/auth/register", json={"username": "seller", "nickname": "测试卖家", "phone": "13800000001", "password": "password123"})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_template_is_reused_and_item_can_omit_optional_labels():
    reset_database()
    with TestClient(app) as client:
        headers = auth_headers(client)
        first = client.post("/api/v1/publish/templates/resolve", json={"item_name": "充电宝"}, headers=headers)
        assert first.status_code == 200
        template = first.json()
        assert template["reused"] is False
        assert any(label["key"] == "has_integrated_cable" for label in template["labels"])

        second = client.post("/api/v1/publish/templates/resolve", json={"item_name": "  充 电 宝  "}, headers=headers)
        assert second.status_code == 200
        assert second.json()["reused"] is True
        assert second.json()["id"] == template["id"]

        item = client.post(
            "/api/v1/items",
            json={
                "item_name": "充电宝",
                "template_id": template["id"],
                "price": "59.90",
                "description": "九成新，可带到图书馆交易",
                "attributes": {"capacity_mah": 10000},
            },
            headers=headers,
        )
        assert item.status_code == 201
        assert item.json()["attributes"] == {"capacity_mah": 10000}


def test_price_is_required_and_positive():
    reset_database()
    with TestClient(app) as client:
        headers = auth_headers(client)
        template = client.post("/api/v1/publish/templates/resolve", json={"item_name": "耳机"}, headers=headers).json()
        response = client.post(
            "/api/v1/items",
            json={"item_name": "耳机", "template_id": template["id"], "price": 0},
            headers=headers,
        )
        assert response.status_code == 422


def test_buyer_match_graph_extracts_a_requirement():
    reset_database()
    with TestClient(app) as client:
        seller_headers = auth_headers(client)
        template = client.post("/api/v1/publish/templates/resolve", json={"item_name": "充电宝"}, headers=seller_headers).json()
        client.post(
            "/api/v1/items",
            json={"item_name": "充电宝", "template_id": template["id"], "price": "59.90", "attributes": {"has_integrated_cable": True}},
            headers=seller_headers,
        )
        buyer = client.post("/api/v1/auth/register", json={"username": "buyer", "nickname": "测试买家", "phone": "13800000002", "password": "password123"})
        buyer_headers = {"Authorization": f"Bearer {buyer.json()['access_token']}"}
        response = client.post("/api/v1/match/sessions", json={"query": "80元以内带线的充电宝"}, headers=buyer_headers)
        assert response.status_code == 201
        assert response.json()["status"] == "completed"
        assert response.json()["matched"][0]["item"]["item_name"] == "充电宝"


def test_confirmed_reservation_marks_item_reserved_and_shows_phone():
    reset_database()
    with TestClient(app) as client:
        seller_headers = auth_headers(client)
        template = client.post("/api/v1/publish/templates/resolve", json={"item_name": "台灯"}, headers=seller_headers).json()
        item = client.post(
            "/api/v1/items",
            json={"item_name": "台灯", "template_id": template["id"], "price": "30.00"},
            headers=seller_headers,
        ).json()
        buyer = client.post(
            "/api/v1/auth/register",
            json={"username": "buyer", "nickname": "测试买家", "phone": "13800000002", "password": "password123"},
        )
        buyer_headers = {"Authorization": f"Bearer {buyer.json()['access_token']}"}
        reservation = client.post(
            "/api/v1/reservations",
            json={"item_id": item["id"], "agreed_price": "30.00", "appointment_time": "2026-12-01T10:00:00", "location": "图书馆一楼"},
            headers=buyer_headers,
        ).json()
        confirmed = client.post(f"/api/v1/reservations/{reservation['id']}/confirm", headers=seller_headers)
        assert confirmed.status_code == 200
        assert client.get(f"/api/v1/items/{item['id']}", headers=buyer_headers).json()["status"] == "reserved"
        buyer_reservations = client.get("/api/v1/reservations/mine", headers=buyer_headers).json()
        assert buyer_reservations[0]["counterpart_phone"] == "13800000001"
        assert client.post(f"/api/v1/reservations/{reservation['id']}/complete", headers=buyer_headers).status_code == 200
        assert client.get(f"/api/v1/items/{item['id']}", headers=buyer_headers).json()["status"] == "reserved"
        assert client.post(f"/api/v1/reservations/{reservation['id']}/complete-confirm", headers=seller_headers).status_code == 200
        assert client.get(f"/api/v1/items/{item['id']}", headers=buyer_headers).json()["status"] == "sold"


def test_failed_reservation_returns_item_to_on_sale():
    reset_database()
    with TestClient(app) as client:
        seller_headers = auth_headers(client)
        template = client.post("/api/v1/publish/templates/resolve", json={"item_name": "台灯"}, headers=seller_headers).json()
        item = client.post("/api/v1/items", json={"item_name": "台灯", "template_id": template["id"], "price": "30.00"}, headers=seller_headers).json()
        buyer = client.post("/api/v1/auth/register", json={"username": "buyer", "nickname": "测试买家", "phone": "13800000002", "password": "password123"})
        buyer_headers = {"Authorization": f"Bearer {buyer.json()['access_token']}"}
        reservation = client.post("/api/v1/reservations", json={"item_id": item["id"], "agreed_price": "30.00", "appointment_time": "2026-12-01T10:00:00", "location": "图书馆一楼"}, headers=buyer_headers).json()
        assert client.post(f"/api/v1/reservations/{reservation['id']}/confirm", headers=seller_headers).status_code == 200
        failed = client.post(f"/api/v1/reservations/{reservation['id']}/fail", json={"failure_reason": "物品与描述不符"}, headers=buyer_headers)
        assert failed.status_code == 200
        assert failed.json()["status"] == "failed"
        assert client.get(f"/api/v1/items/{item['id']}", headers=buyer_headers).json()["status"] == "on_sale"
