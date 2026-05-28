from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://aiops_user:password@postgres:5432/aiops"

    # JWT
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # External services
    prometheus_url: str = "http://prometheus:9090"
    jaeger_url: str = "http://jaeger:16686"

    # CORS
    cors_origins: str = "http://localhost:3000"

    # OTel
    otel_exporter_otlp_endpoint: str = "http://otel-collector:4317"
    otel_service_name: str = "backend"

    # SMTP — email notifications
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "aiops-alerts@example.com"
    smtp_tls: bool = True

    environment: str = "development"

    monitored_services: str = "aiops-platform,storefront-service"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def monitored_services_list(self) -> list[str]:
        return [s.strip() for s in self.monitored_services.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
