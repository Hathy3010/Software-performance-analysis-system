# 02 — Business Context

## The Problem

Modern software systems are composed of many interacting microservices. When something goes wrong — a latency spike, a surge in error rate, a downstream dependency becoming slow — the impact cascades across the system before anyone notices.

The traditional response is manual: engineers receive a Prometheus alert, open Grafana to find the affected metric, pivot to Jaeger to inspect traces, correlate timestamps, and eventually hypothesize a root cause. This process takes **30–90 minutes** even for experienced engineers, and longer during off-hours when context is cold.

AIOps addresses three specific failure modes in this workflow:

| Failure Mode | AIOps Response |
|---|---|
| Alert fatigue — too many firing alerts, unclear priority | AI-scored anomalies with confidence levels cut false positives |
| Slow diagnosis — engineers correlate data manually | Automated RCA links the anomaly to its cause within the same pipeline cycle |
| Knowledge dependency — only senior engineers can diagnose | The RCA engine encodes diagnostic rules that any operator can read |

---

## Stakeholders

| Stakeholder | Role in system | Primary concern |
|---|---|---|
| **Operations Engineer** | Day-to-day incident responder | Fast MTTA (mean time to acknowledge) and clear root cause |
| **Software Analyst** | Investigates patterns, files reports | Accurate anomaly scoring, exportable report history |
| **System Administrator** | Manages users, services, configuration | RBAC enforcement, audit trail, clean user management |
| **Viewer / Observer** | Management, auditors, other teams | Read-only summary of system health and incidents |

---

## Value Proposition

**For the ops team:**  
Incidents that previously required manual correlation across three tools (Prometheus, Jaeger, logs) now have an automatically generated root cause hypothesis waiting in the incident detail view before an engineer even opens their laptop.

**For the organisation:**  
Lower MTTR (mean time to resolve) directly reduces the business impact of outages. The system also maintains a complete audit trail and RCA history, supporting post-incident review and compliance requirements.

**For the thesis:**  
The project demonstrates integration of ML/AI (Isolation Forest, polynomial regression), modern Python async patterns (FastAPI, SQLAlchemy 2.0), observability primitives (OTel, Prometheus, Jaeger), and production-grade frontend engineering (React, Recharts, JWT) in a single coherent system.

---

## Constraints

| Constraint | Impact |
|---|---|
| Single-machine Docker Compose deployment | No Kubernetes; limited horizontal scaling |
| No labelled anomaly dataset | Must use unsupervised ML (Isolation Forest) |
| Graduation project timeline | Scope bounded; no Alertmanager, log aggregation, or LSTM models |
| Python-only AI engine | No separate model serving infrastructure |

---

## Assumptions

1. Prometheus is already scraping metrics from all monitored services (configured via `prometheus.yml`).
2. All services emit OpenTelemetry traces via the OTLP gRPC protocol.
3. Services are identified by their Prometheus `job=` label, which matches the `name` field in the `services` table.
4. The `demo-app` generates representative traffic patterns including occasional anomaly spikes.
