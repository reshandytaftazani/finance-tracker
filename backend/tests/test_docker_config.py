"""Tests for Docker / hosting configuration and host binding rules."""

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_allows_network_bind_when_auth_enabled():
    settings = Settings(_env_file=None, host="0.0.0.0", auth_enabled=True)
    assert settings.host == "0.0.0.0"
    assert settings.auth_enabled is True


def test_settings_allows_network_bind_in_non_local_env():
    settings = Settings(_env_file=None, host="0.0.0.0", env="production")
    assert settings.host == "0.0.0.0"
    assert settings.env == "production"


def test_settings_rejects_network_bind_when_unauthenticated_and_local():
    with pytest.raises(ValidationError, match="APP_HOST must be a loopback IP address"):
        Settings(_env_file=None, host="0.0.0.0", auth_enabled=False, env="local")


def test_settings_includes_same_origin_port_in_allowed_origins():
    settings = Settings(_env_file=None, port=8000)
    assert "http://127.0.0.1:8000" in settings.allowed_origins
    assert "http://localhost:8000" in settings.allowed_origins


def test_settings_supports_static_dir_configuration():
    settings = Settings(_env_file=None, static_dir="/app/static")
    assert settings.static_dir == "/app/static"
