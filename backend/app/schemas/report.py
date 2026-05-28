import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

ReportType = Literal[
    "incident_report", "performance_report", "anomaly_report", "capacity_report"
]
ReportFormat = Literal["pdf", "html", "json"]
ReportStatus = Literal["pending", "generating", "ready", "failed"]


class ReportBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    report_type: ReportType
    format: ReportFormat = "json"
    parameters: dict[str, Any] = {}


class ReportCreate(ReportBase):
    pass


class ReportRead(ReportBase):
    id: uuid.UUID
    generated_by: uuid.UUID | None
    status: ReportStatus
    content: str | None
    file_path: str | None
    created_at: datetime
    updated_at: datetime
