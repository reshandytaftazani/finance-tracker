from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/health", headers={"host": "testserver"})

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_rejects_unknown_host() -> None:
    response = client.get("/health", headers={"host": "example.com"})

    assert response.status_code == 400
