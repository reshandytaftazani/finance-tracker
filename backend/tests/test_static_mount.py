"""Integration tests for FastAPI static frontend serving and SPA fallback."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


@pytest.fixture
def static_app(tmp_path):
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    assets_dir = static_dir / "assets"
    assets_dir.mkdir()

    (static_dir / "index.html").write_text("<!DOCTYPE html><html><body>SPA Root</body></html>")
    (static_dir / "favicon.ico").write_text("icon-binary-data")
    (assets_dir / "app.js").write_text("console.log('app loaded');")

    settings = get_settings().model_copy(update={"static_dir": str(static_dir)})
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(app) as client:
            yield client, static_dir
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def test_root_serves_index_html(static_app):
    client, _ = static_app
    response = client.get("/")
    assert response.status_code == 200
    assert "SPA Root" in response.text
    assert "text/html" in response.headers.get("content-type", "")


def test_static_asset_served_directly(static_app):
    client, _ = static_app
    response = client.get("/assets/app.js")
    assert response.status_code == 200
    assert "app loaded" in response.text


def test_static_file_in_root_served_directly(static_app):
    client, _ = static_app
    response = client.get("/favicon.ico")
    assert response.status_code == 200
    assert "icon-binary-data" in response.text


def test_spa_client_side_route_falls_back_to_index_html(static_app):
    client, _ = static_app
    response = client.get("/transactions")
    assert response.status_code == 200
    assert "SPA Root" in response.text

    response2 = client.get("/budgets")
    assert response2.status_code == 200
    assert "SPA Root" in response2.text


def test_api_routes_are_not_shadowed_by_spa_fallback(static_app):
    client, _ = static_app
    # Health endpoint still works
    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json() == {"status": "ok"}

    # Non-existent API route returns 404 JSON, NOT index.html
    api_resp = client.get("/api/v1/nonexistent-endpoint")
    assert api_resp.status_code == 404
    assert api_resp.json() == {"detail": "Not Found"}
