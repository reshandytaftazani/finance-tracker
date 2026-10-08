from fastapi import APIRouter
from fastapi.testclient import TestClient

from app.main import app

dummy_router = APIRouter()


@dummy_router.post("/test-mutation")
def dummy_mutation() -> dict[str, str]:
    return {"status": "ok"}


@dummy_router.delete("/test-mutation")
def dummy_delete() -> dict[str, str]:
    return {"status": "deleted"}


app.include_router(dummy_router)
client = TestClient(app)


def test_mutation_rejects_untrusted_origin() -> None:
    response = client.post(
        "/test-mutation",
        headers={"host": "testserver", "origin": "http://malicious-website.com"},
        json={"data": "test"},
    )
    assert response.status_code == 403
    assert "Origin not allowed" in response.json().get("detail", "")


def test_delete_rejects_untrusted_origin() -> None:
    response = client.delete(
        "/test-mutation",
        headers={"host": "testserver", "origin": "http://malicious-website.com"},
    )
    assert response.status_code == 403


def test_mutation_rejects_cross_site_sec_fetch() -> None:
    response = client.post(
        "/test-mutation",
        headers={
            "host": "testserver",
            "sec-fetch-site": "cross-site",
            "origin": "http://localhost:5173",
        },
        json={"data": "test"},
    )
    assert response.status_code == 403
    assert "Cross-site" in response.json().get("detail", "")


def test_mutation_rejects_unsupported_content_type() -> None:
    response = client.post(
        "/test-mutation",
        headers={
            "host": "testserver",
            "origin": "http://localhost:5173",
            "content-type": "text/plain",
        },
        content="plain text body",
    )
    assert response.status_code == 415


def test_mutation_rejects_form_content_type() -> None:
    response = client.post(
        "/test-mutation",
        headers={
            "host": "testserver",
            "origin": "http://localhost:5173",
            "content-type": "application/x-www-form-urlencoded",
        },
        content="a=1&b=2",
    )
    assert response.status_code == 415


def test_mutation_allows_trusted_origin_with_json() -> None:
    response = client.post(
        "/test-mutation",
        headers={
            "host": "testserver",
            "origin": "http://localhost:5173",
        },
        json={"key": "val"},
    )
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_mutation_allows_cli_request_without_origin() -> None:
    response = client.post(
        "/test-mutation",
        headers={"host": "testserver"},
        json={"key": "val"},
    )
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_request_is_not_blocked_by_mutation_check() -> None:
    response = client.get(
        "/health",
        headers={"host": "testserver", "origin": "http://other-site.com"},
    )
    assert response.status_code == 200
