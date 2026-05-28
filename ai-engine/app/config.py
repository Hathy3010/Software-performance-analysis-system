from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+psycopg2://aiops_user:password@postgres:5432/aiops"

    # External services
    prometheus_url: str = "http://prometheus:9090"
    jaeger_url: str = "http://jaeger:16686"

    # OpenTelemetry
    otel_exporter_otlp_endpoint: str = "http://otel-collector:4317"
    otel_service_name: str = "ai-engine"
    otel_resource_attributes: str = "service.namespace=prod,service.version=1.0.0"

    # Detection tuning
    anomaly_score_threshold: float = 0.70
    detection_interval_seconds: int = 60
    metrics_lookback_minutes: int = 60
    forecast_horizon_minutes: int = 30
    min_isolation_forest_samples: int = 20

    # Services to monitor (comma-separated job names matching Prometheus scrape targets)
    monitored_services: str = "aiops-platform,storefront-service"

    # SMTP — email notifications (read same env vars as backend)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "aiops-alerts@example.com"
    smtp_tls: bool = True

    environment: str = "development"

    @property
    def monitored_services_list(self) -> list[str]:
        return [s.strip() for s in self.monitored_services.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
