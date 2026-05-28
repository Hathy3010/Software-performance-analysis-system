import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

AlertSeverity = Literal["critical", "high", "medium", "low"]
AlertStatus = Literal["firing", "resolved", "acknowledged", "pending"]


class AlertBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    severity: AlertSeverity
    status: AlertStatus = "pending"
    message: str | None = None
    labels: dict[str, Any] = {}
    annotations: dict[str, Any] = {}
    fingerprint: str | None = None


class AlertCreate(AlertBase):
    service_id: uuid.UUID
    incident_id: uuid.UUID | None = None


class AlertUpdate(BaseModel):
    status: AlertStatus | None = None
    severity: AlertSeverity | None = None
    message: str | None = None
    incident_id: uuid.UUID | None = None


class AcknowledgePayload(BaseModel):
    comment: str


class AlertRead(AlertBase):
    id: uuid.UUID
    service_id: uuid.UUID
    incident_id: uuid.UUID | None
    fired_at: datetime | None
    resolved_at: datetime | None
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
    acknowledge_comment: str | None = None
    created_at: datetime
    updated_at: datetime
