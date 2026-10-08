import pytest
from pydantic import ValidationError

from app.config import Settings


@pytest.mark.parametrize("host", ["127.0.0.1", "127.0.0.2", "::1"])
def test_settings_accept_loopback_hosts(host: str) -> None:
    assert Settings(_env_file=None, host=host).host == host


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.1.20", "localhost"])
def test_settings_reject_non_loopback_or_hostname_binds(host: str) -> None:
    with pytest.raises(ValidationError, match="APP_HOST must be a loopback IP address"):
        Settings(_env_file=None, host=host)


def test_settings_reject_network_bind_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_HOST", "0.0.0.0")

    with pytest.raises(ValidationError, match="network binds are not allowed"):
        Settings(_env_file=None)
