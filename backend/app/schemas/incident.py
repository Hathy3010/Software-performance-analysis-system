import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

IncidentSeverity = Literal["critical", "high", "medium", "low"]
IncidentStatus = Literal["open", "investigating", "resolved", "closed"]


class IncidentBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    description: str | None = None
    severity: IncidentSeverity
    status: IncidentStatus = "open"
    tags: dict[str, Any] = {}


class IncidentCreate(IncidentBase):
    service_id: uuid.UUID
    started_at: datetime | None = None


class IncidentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    severity: IncidentSeverity | None = None
    status: IncidentStatus | None = None
    resolved_at: datetime | None = None
    tags: dict[str, Any] | None = None


class IncidentRead(IncidentBase):
    id: uuid.UUID
    service_id: uuid.UUID
    service_name: str | None = None
    started_at: datetime
    resolved_at: datetime | None
    duration_seconds: int | None
    created_at: datetime
    updated_at: datetime
