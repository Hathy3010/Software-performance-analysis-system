import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationSettingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    email_enabled: bool
    min_score: float
    notify_critical: bool
    notify_error: bool
    notify_warn: bool
    created_at: datetime
    updated_at: datetime


class NotificationSettingUpdate(BaseModel):
    email_enabled: bool | None = None
    min_score: float | None = None
    notify_critical: bool | None = None
    notify_error: bool | None = None
    notify_warn: bool | None = None


class NotificationLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    subject: str
    service_name: str
    anomaly_score: float
    sent_at: datetime
    status: str
