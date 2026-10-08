from functools import lru_cache
from ipaddress import ip_address

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="APP_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    name: str = "Personal Finance Tracker"
    env: str = "local"
    debug: bool = False
    host: str = "127.0.0.1"
    port: int = 8000
    database_url: str = "sqlite:///./data/finance.db"
    frontend_origin: str = "http://localhost:5173"
    allowed_hosts: list[str] = ["127.0.0.1", "localhost", "testserver"]

    @field_validator("host")
    @classmethod
    def host_must_be_loopback(cls, host: str) -> str:
        """Keep the unauthenticated local app off the network."""
        try:
            address = ip_address(host)
        except ValueError as error:
            raise ValueError(
                "APP_HOST must be a loopback IP address (127.0.0.1 or ::1); "
                "network and hostname binds are not allowed without authentication"
            ) from error

        if not address.is_loopback:
            raise ValueError(
                "APP_HOST must be a loopback IP address (127.0.0.1 or ::1); "
                "network binds are not allowed without authentication"
            )
        return host

    @property
    def allowed_origins(self) -> list[str]:
        origins = {self.frontend_origin}
        if "localhost" in self.frontend_origin:
            origins.add(self.frontend_origin.replace("localhost", "127.0.0.1"))
        elif "127.0.0.1" in self.frontend_origin:
            origins.add(self.frontend_origin.replace("127.0.0.1", "localhost"))
        return sorted(origins)


@lru_cache
def get_settings() -> Settings:
    return Settings()
