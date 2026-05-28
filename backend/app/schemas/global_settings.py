from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RoutingRule(BaseModel):
    service_pattern: str = Field(description="Glob-style service name pattern, e.g. 'payment-*'")
    severity: str = Field(description="'critical' | 'high' | 'medium' | 'low'")
    notify_user_ids: list[str] = Field(default_factory=list)
    escalate_after_minutes: int = Field(default=30, ge=1)


class GlobalSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    anomaly_score_threshold: float
    detection_interval_seconds: int
    alert_sound_enabled: bool
    browser_push_enabled: bool
    escalation_enabled: bool
    escalation_timeout_minutes: int
    routing_rules: list[Any]
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_from: str
    updated_at: datetime
    updated_by: str | None
    changelog: str | None


class GlobalSettingsUpdate(BaseModel):
    anomaly_score_threshold: float | None = None
    detection_interval_seconds: int | None = None
    alert_sound_enabled: bool | None = None
    browser_push_enabled: bool | None = None
    escalation_enabled: bool | None = None
    escalation_timeout_minutes: int | None = None
    routing_rules: list[Any] | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_from: str | None = None
    changelog: str | None = None
