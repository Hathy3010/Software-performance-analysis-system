# 01 — Project Overview

## What the System Does

AIOps is an **AI-powered operations platform** for monitoring a fleet of microservices. It ingests real-time telemetry, detects performance anomalies using machine learning, performs automated root cause analysis, and presents everything through an operations dashboard.

The system closes the loop between *observing* a problem and *understanding why it happened* — a task that typically requires a senior engineer spending 30–90 minutes correlating metrics, logs, and traces manually.

---

## Core Capabilities

### 1. Real-time Monitoring
- Polls Prometheus every 10–15 seconds for CPU, memory, p99 latency, and error rate per service
- Feeds live data into a React dashboard with Recharts streaming charts
- Exposes a platform-wide KPI summary (total services, alerts by severity, MTTR, anomaly count)

### 2. Anomaly Detection
- **Isolation Forest** (scikit-learn) trained on a 120-sample rolling buffer per service
- Detects anomalies in a 4-dimensional feature space: `[cpu_rate, memory_mb, latency_p99, error_rate]`
- Z-score spike detection (threshold = 3.0) runs in parallel as an independent signal
- Falls back to heuristic threshold scoring during the warm-up period (< 20 samples)
- Produces a normalised anomaly score in [0, 1] with full explanation metadata

### 3. Root Cause Analysis (RCA)
- Runs automatically when a service is flagged as anomalous
- Correlates Jaeger distributed traces: child span latencies, child service error counts
- Three rules: highest child latency, child errors, self-anomaly fallback
- Returns top 3 candidate services ranked by confidence score with evidence
- Results linked to open incidents in the database

### 4. CPU Forecasting
- Polynomial regression (degree 2) trained on the last 60 minutes of CPU history
- Predicts 30 future data points (one per minute) — useful for capacity planning
- Runs in the same 60-second pipeline cycle as anomaly detection

### 5. Incident Management
- Full lifecycle: open → investigating → resolved → closed
- `duration_seconds` auto-computed by a PostgreSQL GENERATED ALWAYS column
- RCA results linked to incidents for one-click root cause inspection
- Role-based access: admins and analysts manage; viewers read

### 6. Distributed Tracing
- All three instrumented services (backend, ai-engine, demo-app) emit OTel traces
- Traces flow through OTel Collector → Jaeger
- Visible in the Jaeger UI with full span waterfall and service dependency map

### 7. User Access Control
- Three roles: **admin** (full access), **analyst** (operational), **viewer** (read-only)
- JWT-based authentication (access token 30 min, refresh token 7 days)
- Every API endpoint enforces role checks at the dependency injection level

---

## System Boundary

**In scope:**
- Monitoring services running inside the same Docker network
- FastAPI and demo-app microservices as the observed targets
- All operations performed through the web dashboard or REST API

**Out of scope (future work):**
- Kubernetes deployment / Helm charts
- Alertmanager webhook integration
- Log aggregation (ELK / Loki)
- LSTM/deep learning models for forecasting
- Multi-tenant support

---

## Key Metrics at a Glance

| Metric | Value |
|---|---|
| Services monitored | 2 live (backend, demo-app) + 5 seed demo services |
| AI pipeline cadence | Every 60 seconds |
| Anomaly detection model | Isolation Forest (n_estimators=100, contamination=0.05) |
| Rolling buffer size | 120 samples ≈ 2 hours of history |
| API response target | p99 < 500ms |
| JWT access token lifetime | 30 minutes |
| PostgreSQL TSDB retention (Prometheus) | 15 days |
