from pydantic import BaseModel


class ServiceStatusCount(BaseModel):
    healthy: int = 0
    degraded: int = 0
    down: int = 0
    unknown: int = 0


class AlertSeverityCount(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0


class DashboardSummary(BaseModel):
    total_services: int
    service_status: ServiceStatusCount
    open_incidents: int
    critical_incidents: int
    firing_alerts: int
    alert_severity: AlertSeverityCount
    recent_anomalies_24h: int
    mttr_seconds: float | None  # mean time to resolve (resolved incidents)
