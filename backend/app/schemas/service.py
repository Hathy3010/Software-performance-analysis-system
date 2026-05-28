import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

ServiceType = Literal["web", "api", "database", "cache", "queue", "worker", "other"]
ServiceStatus = Literal["healthy", "degraded", "down", "unknown"]


class ServiceBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    type: ServiceType
    environment: str = "production"
    description: str | None = None
    base_url: str | None = None
    status: ServiceStatus = "unknown"


class ServiceCreate(ServiceBase):
    metadata_: dict[str, Any] = {}


class ServiceUpdate(BaseModel):
    name: str | None = None
    type: ServiceType | None = None
    environment: str | None = None
    description: str | None = None
    base_url: str | None = None
    status: ServiceStatus | None = None
    metadata_: dict[str, Any] | None = None


class ServiceRead(ServiceBase):
    id: uuid.UUID
    metadata_: dict[str, Any]
    created_at: datetime
    updated_at: datetime
