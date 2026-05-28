import uuid
from datetime import datetime

from sqlalchemy import Computed, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(
        Enum("critical", "high", "medium", "low",
             name="incident_severity", create_type=False),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        Enum("open", "investigating", "resolved", "closed",
             name="incident_status", create_type=False),
        nullable=False,
        default="open",
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(
        Integer,
        Computed(
            "CASE WHEN resolved_at IS NOT NULL "
            "THEN EXTRACT(EPOCH FROM (resolved_at - started_at))::integer "
            "ELSE NULL END",
            persisted=True,
        ),
        nullable=True,
    )
    tags: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    service: Mapped["Service"] = relationship("Service", back_populates="incidents")
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="incident")

    @property
    def service_name(self) -> str | None:
        return self.service.name if self.service else None
