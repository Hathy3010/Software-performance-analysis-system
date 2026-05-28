"""initial schema baseline

Revision ID: 0001
Revises:
Create Date: 2026-04-29

NOTE: The database schema is bootstrapped by infra/db/schema.sql via
      Docker's initdb mechanism. This migration exists as the Alembic
      baseline so that future `alembic revision --autogenerate` commands
      produce only incremental diffs.

      If running outside Docker (e.g. local development without schema.sql),
      run: alembic upgrade head  (this migration is a no-op; create tables manually first)
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Schema already created by infra/db/schema.sql (Docker initdb).
    # Nothing to do — this is a baseline stamp.
    pass


def downgrade() -> None:
    # Drop in reverse dependency order
    for table in (
        "audit_logs", "reports", "rca_results", "anomaly_results",
        "alerts", "incidents", "services", "users",
    ):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

    for enum in (
        "user_role", "service_type", "service_status",
        "alert_severity", "alert_status",
        "incident_severity", "incident_status",
        "report_type", "report_format", "report_status",
    ):
        op.execute(f"DROP TYPE IF EXISTS {enum}")
