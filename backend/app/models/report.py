import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    generated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    report_type: Mapped[str] = mapped_column(
        Enum("incident_report", "performance_report", "anomaly_report", "capacity_report",
             name="report_type", create_type=False),
        nullable=False,
        index=True,
    )
    format: Mapped[str] = mapped_column(
        Enum("pdf", "html", "json", name="report_format", create_type=False),
        nullable=False,
        default="json",
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "generating", "ready", "failed",
             name="report_status", create_type=False),
        nullable=False,
        default="pending",
    )
    parameters: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    generated_by_user: Mapped["User | None"] = relationship("User", back_populates="reports")
