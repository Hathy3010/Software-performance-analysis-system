"""Singleton global-settings table — one row, id=1."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GlobalSettings(Base):
    __tablename__ = "global_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # Anomaly / alerting thresholds
    anomaly_score_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.70)
    detection_interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=60)

    # Browser / sound notifications
    alert_sound_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    browser_push_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Escalation
    escalation_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    escalation_timeout_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    # Routing rules: list[{service_pattern, severity, notify_user_ids, escalate_after_minutes}]
    routing_rules: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # SMTP (editable from UI — overrides .env at runtime for the backend process)
    smtp_host: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    smtp_port: Mapped[int] = mapped_column(Integer, nullable=False, default=587)
    smtp_user: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    smtp_from: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    # Audit
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
