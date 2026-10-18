"""
Integration tests run against a real MySQL database named by TEST_DATABASE_URL.
That database is wiped and recreated, so never point it at real data.
Without TEST_DATABASE_URL only the pure unit tests run.
"""
import os
import uuid

import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if TEST_DATABASE_URL:
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["ADMIN_PASSWORD"] = "Admin@12345"
os.environ.setdefault("JWT_SECRET", "test-only-secret-" + "x" * 32)

PASSWORD = "Passw0rd!23"


@pytest.fixture(scope="session")
def client():
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL is not set")

    from fastapi.testclient import TestClient

    from app.database import init_db, seed
    from app.database.models import Base
    from app.database.session import SessionLocal, engine
    from app.main import app

    init_db.ensure_database_exists()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed.seed_specializations(db)
        seed.seed_admin(db)

    with TestClient(app) as test_client:
        yield test_client


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def register(client):
    """Registers a user and returns (headers, user)."""

    def _register(role: str = "patient", **extra):
        payload = {
            "full_name": extra.pop("full_name", f"Test {role.title()}"),
            "email": f"{role}-{uuid.uuid4().hex[:8]}@example.com",
            "password": PASSWORD,
            **extra,
        }
        response = client.post(f"/api/auth/register/{role}", json=payload)
        assert response.status_code == 201, response.text
        body = response.json()
        return auth_headers(body["access_token"]), body["user"]

    return _register


@pytest.fixture
def admin_headers(client):
    response = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "Admin@12345"})
    assert response.status_code == 200, response.text
    return auth_headers(response.json()["access_token"])


@pytest.fixture
def verified_doctor(client, register, admin_headers):
    """A verified doctor available every day, 00:00–23:30 clinic time, in 30-minute slots."""
    specialization_id = client.get("/api/specializations").json()[0]["id"]
    headers, user = register(
        "doctor",
        specialization_id=specialization_id,
        license_number=f"LIC-{uuid.uuid4().hex[:10]}",
        qualifications="MBBS",
        years_of_practice=10,
    )
    response = client.patch(
        f"/api/admin/doctors/{user['id']}/verification", json={"status": "verified"}, headers=admin_headers
    )
    assert response.status_code == 200, response.text
    rules = [{"day_of_week": d, "start_time": "00:00", "end_time": "23:30"} for d in range(7)]
    response = client.put(
        "/api/doctors/me/availability",
        json={"consultation_duration_minutes": 30, "rules": rules},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return headers, user


def first_free_slot(client, doctor_id: int, headers: dict) -> str:
    calendar = client.get(f"/api/doctors/{doctor_id}/slots?days=3", headers=headers).json()
    return next(s["start"] for day in calendar["days"] for s in day["slots"] if s["available"])
