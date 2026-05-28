# 03 — Architecture

## 1. System Overview

```mermaid
graph TB
    Browser["🌐 Browser"]

    subgraph FN["frontend-net"]
        FE["⬜ Frontend\nReact 18 + Nginx\n:3000"]
    end

    subgraph DN["db-net (internal)"]
        PG[("🐘 PostgreSQL 16\n:5432")]
    end

    subgraph MN["monitoring-net"]
        BE["⬜ Backend\nFastAPI / Uvicorn\n:8000"]
        AI["🤖 AI Engine\nIsolationForest\n:8001"]
        DEMO["⬜ Demo App\nFastAPI\n:8080"]
        OTEL["📡 OTel Collector\n:4317 gRPC\n:4318 HTTP"]
        PROM["📊 Prometheus\n:9090"]
        GRAF["📈 Grafana\n:3001"]
        JAEGER["🔍 Jaeger\n:16686"]
    end

    Browser -->|"HTTP :3000"| FE
    FE -->|"/api/v1/** (proxy)"| BE
    BE <-->|"asyncpg"| PG
    AI <-->|"psycopg2"| PG

    BE -->|"OTLP gRPC"| OTEL
    AI -->|"OTLP gRPC"| OTEL
    DEMO -->|"OTLP gRPC"| OTEL

    OTEL -->|"traces"| JAEGER
    OTEL -->|"metrics :8889"| PROM

    PROM -->|"scrape /metrics"| BE
    PROM -->|"scrape /metrics"| DEMO
    PROM -->|"scrape /metrics"| AI

    AI -->|"PromQL queries"| PROM
    AI -->|"trace queries"| JAEGER
    BE -->|"PromQL proxy"| PROM

    PROM -->|"datasource"| GRAF
    JAEGER -->|"datasource"| GRAF
```

---

## 2. Docker Network Isolation

```mermaid
graph LR
    subgraph db-net["db-net — internal, no internet"]
        PG2[("PostgreSQL")]
        BE2["Backend"]
        AI2["AI Engine"]
    end

    subgraph monitoring-net["monitoring-net"]
        OTEL2["OTel Collector"]
        PROM2["Prometheus"]
        GRAF2["Grafana"]
        JAEGER2["Jaeger"]
        BE3["Backend"]
        AI3["AI Engine"]
        DEMO2["Demo App"]
    end

    subgraph frontend-net["frontend-net"]
        FE2["Frontend"]
        BE4["Backend"]
    end

    HOST["🌐 Host Browser"] -->|":3000"| FE2
    HOST -->|":3001"| GRAF2
    HOST -->|":9090"| PROM2
    HOST -->|":16686"| JAEGER2
    HOST -->|":8080"| DEMO2
```

---

## 3. Request Data Flow

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend (Nginx :3000)
    participant BE as Backend (FastAPI :8000)
    participant PG as PostgreSQL
    participant OTEL as OTel Collector
    participant Jaeger

    User->>FE: GET /services (browser)
    FE->>BE: GET /api/v1/services/ (proxy)
    BE->>BE: Validate JWT token
    BE->>PG: SELECT * FROM services (asyncpg)
    PG-->>BE: rows
    BE-->>FE: JSON { items: [...] }
    FE-->>User: Render services table

    BE--)OTEL: Span: http.GET /api/v1/services (gRPC async)
    OTEL--)Jaeger: Store trace
```

---

## 4. AI Engine Pipeline (every 60 seconds)

```mermaid
flowchart TD
    SCHED["⏱ Scheduler\nfires every 60s"]

    subgraph INGEST["Ingestion"]
        PROM_Q["PrometheusIngester\ncpu_rate, memory_mb\nlatency_p99, error_rate"]
        JAE_Q["JaegerIngester\ntrace count, avg duration\np99, error count"]
    end

    subgraph DETECT["Detection — per service"]
        BUF["Rolling deque\nmaxlen=120"]
        ZSCORE["Z-score spike\ncheck"]
        THRESH["Threshold fallback\n(samples < 20)"]
        IF["IsolationForest\n.fit + .score"]
        SCORE["anomaly_score\n0.0 – 1.0"]
    end

    subgraph RCA["RCA Engine (if anomalous)"]
        RULE_A["Rule A\nHighest avg trace duration"]
        RULE_B["Rule B\nChild services with errors"]
        RULE_C["Rule C\nSelf-anomaly fallback"]
        CAND["Top-3 candidates\nby confidence"]
    end

    subgraph FORECAST["CPU Forecaster"]
        HIST["query_range\nlast 60 min"]
        POLY["PolynomialFeatures(2)\n+ LinearRegression"]
        PRED["30-point forecast\n30-min horizon"]
    end

    subgraph PERSIST["Persistence"]
        DB_A["INSERT anomaly_results"]
        DB_R["INSERT rca_results"]
        DB_F["INSERT forecasts"]
    end

    SCHED --> PROM_Q
    SCHED --> JAE_Q
    PROM_Q --> BUF
    JAE_Q --> BUF
    BUF --> ZSCORE
    ZSCORE -->|spike| SCORE
    BUF -->|"< 20 samples"| THRESH --> SCORE
    BUF -->|">= 20 samples"| IF --> SCORE
    SCORE -->|"> threshold (0.70)"| RULE_A
    SCORE -->|"> threshold (0.70)"| RULE_B
    SCORE -->|"> threshold (0.70)"| RULE_C
    RULE_A & RULE_B & RULE_C --> CAND
    SCHED --> HIST --> POLY --> PRED
    SCORE --> DB_A
    CAND --> DB_R
    PRED --> DB_F
```

---

## 5. Demo Scenario System

```mermaid
stateDiagram-v2
    [*] --> Idle : docker compose up

    Idle --> basic_anomaly : POST /demo/basic_anomaly/start
    Idle --> performance_issue : POST /demo/performance_issue/start
    Idle --> error_spike : POST /demo/error_spike/start
    Idle --> intermittent_failure : POST /demo/intermittent_failure/start
    Idle --> dependency_failure : POST /demo/dependency_failure/start
    Idle --> cascading_failure : POST /demo/cascading_failure/start
    Idle --> wow_rca : POST /demo/wow_rca/start

    basic_anomaly --> Idle : POST /demo/stop\nscore ≈ 0.20–0.35
    performance_issue --> Idle : POST /demo/stop\nscore ≈ 0.55–0.70
    error_spike --> Idle : POST /demo/stop\nscore ≈ 0.40–0.55
    intermittent_failure --> Idle : POST /demo/stop\nscore ≈ 0.20↔0.65
    dependency_failure --> Idle : POST /demo/stop\nscore ≈ 0.75–0.85
    cascading_failure --> Idle : POST /demo/stop\nscore ≈ 0.25→0.90
    wow_rca --> Idle : auto-recovers at 95s\nscore ≈ 0.10→0.95→0.10
```

---

## 6. wow_rca — Phase Timeline

```mermaid
gantt
    title wow_rca Scenario — Phase Timeline
    dateFormat  s
    axisFormat  %Ss

    section Payment DB
    Phase 1 — payment_db_degrading (lat 0.6s, err 5%)  : 0, 20s

    section Cascade Begins
    Phase 2 — order_cascade_begins (pay lat 1.8s 40% err, ord lat 1.2s 25% err) : 20, 45s

    section Full Impact
    Phase 3 — full_impact (pay 3.0s 90% err, ord 2.5s 70% err, CPU burn) : 45, 75s

    section Recovery
    Phase 4 — recovering (pay 0.4s 5% err, ord 0.2s 2% err) : 75, 95s

    section Stable
    Phase 5 — recovered (all effects = 0) : 95, 120s
```

---

## 7. Database Entity Relationships

```mermaid
erDiagram
    users {
        uuid id PK
        varchar email UK
        varchar username UK
        text hashed_password
        enum role "admin|analyst|viewer"
        boolean is_active
        timestamptz last_login_at
    }

    services {
        uuid id PK
        varchar name UK
        enum status "healthy|degraded|down|unknown"
        varchar prometheus_job
        varchar namespace
        varchar team
        jsonb tags
    }

    incidents {
        uuid id PK
        varchar title
        enum severity "critical|high|medium|low|info"
        enum status "open|investigating|resolved|closed"
        uuid service_id FK
        uuid assigned_to FK
        timestamptz started_at
        timestamptz resolved_at
        integer duration_seconds "GENERATED ALWAYS"
    }

    alerts {
        uuid id PK
        uuid service_id FK
        uuid incident_id FK
        varchar alert_name
        enum severity
        enum status "firing|resolved|acknowledged"
        varchar fingerprint UK
        double metric_value
        timestamptz fired_at
    }

    anomaly_results {
        uuid id PK
        uuid service_id FK
        double anomaly_score "0.0–1.0"
        boolean is_anomaly
        varchar model_name
        jsonb raw_data_snapshot
        timestamptz detected_at
    }

    rca_results {
        uuid id PK
        uuid incident_id FK
        uuid service_id FK
        uuid root_cause_service_id FK
        text root_cause
        jsonb contributing_factors
        jsonb causal_graph
        double confidence_score
        enum status "pending|completed|failed"
    }

    reports {
        uuid id PK
        uuid generated_by FK
        uuid incident_id FK
        enum report_type
        enum status "generating|ready|failed"
        jsonb content
    }

    audit_logs {
        uuid id PK
        uuid user_id FK
        enum action
        varchar resource_type
        uuid resource_id
        jsonb old_values
        jsonb new_values
        inet ip_address
    }

    users ||--o{ incidents : "assigned_to / created_by"
    users ||--o{ reports : "generated_by"
    users ||--o{ audit_logs : "user_id"
    services ||--o{ incidents : "service_id"
    services ||--o{ alerts : "service_id"
    services ||--o{ anomaly_results : "service_id"
    services ||--o{ rca_results : "service_id / root_cause_service_id"
    incidents ||--o{ alerts : "incident_id"
    incidents ||--o{ rca_results : "incident_id"
    incidents ||--o{ reports : "incident_id"
    anomaly_results ||--o{ rca_results : "anomaly_id"
```

---

## 8. Frontend Page → API Map

```mermaid
graph LR
    subgraph Pages
        D["Dashboard"]
        M["Metrics"]
        I["Incidents"]
        S["Services"]
    end

    subgraph Backend["Backend /api/v1"]
        D1["GET /dashboard/summary"]
        M1["GET /metrics/current"]
        I1["GET /incidents"]
        I2["GET /incidents/:id/rca"]
        I3["POST /incidents/:id/resolve"]
        S1["GET /services"]
        S2["POST /services"]
        S3["PUT /services/:id"]
        S4["DELETE /services/:id"]
    end

    subgraph External
        PROM3["Prometheus\n:9090"]
    end

    D -->|"30s poll"| D1
    M -->|"10s poll"| M1
    I -->|"30s poll"| I1
    I --> I2
    I --> I3
    S -->|"60s poll"| S1
    S --> S2
    S --> S3
    S --> S4

    M1 -->|"PromQL"| PROM3
```

---

## Component Responsibilities

| Component | Owns | Does NOT own |
|---|---|---|
| **Backend** | REST API, auth, business rules, DB reads/writes | Anomaly detection, metric ingestion |
| **AI Engine** | Detection pipeline, RCA, forecasting, persistence | User auth, API serving |
| **Frontend** | UI rendering, polling, user interaction | Business logic, direct DB access |
| **Demo App** | Synthetic traffic, OTel instrumentation, chaos injection | Real business logic |
| **Prometheus** | Metric time-series storage | Alert routing |
| **Jaeger** | Trace storage and query | Metrics |
| **OTel Collector** | Trace/metric reception and fan-out | Processing logic |

---

## Key Design Decisions

**Async backend, sync AI engine:** FastAPI backend uses `asyncpg` (fully async) for high concurrency. The AI engine uses `psycopg2` (sync) inside a background thread — scikit-learn's `fit()` is CPU-bound and releases the GIL, making threading appropriate.

**Schema bootstrapped by schema.sql, tracked by Alembic:** Initial schema created by PostgreSQL's `initdb` mechanism. Alembic migration 0001 is a no-op baseline stamp. All future changes go through `alembic revision --autogenerate`.

**OTel Collector as central fan-out:** All instrumented services send to one endpoint (`otel-collector:4317`). The collector routes to Jaeger and Prometheus without code changes in the services.

**Self-generating demo traffic:** Each scenario coroutine runs `asyncio.gather(traffic_loop, phase_logic)` — the traffic loop fires HTTP requests against its own endpoints so Prometheus always has real samples to scrape, regardless of external load.

---

## 9. Sequence Diagrams (Biểu đồ tuần tự)

### 9a. User Login & Token Lifecycle

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend (React)
    participant LS as localStorage
    participant BE as Backend (FastAPI)
    participant PG as PostgreSQL

    User->>FE: Enter username + password
    FE->>BE: POST /api/v1/auth/login\n{ username, password }
    BE->>PG: SELECT * FROM users WHERE username=?
    PG-->>BE: user row (hashed_password, role, is_active)
    BE->>BE: bcrypt.verify(password, hash)

    alt Credentials valid
        BE->>BE: create_access_token (exp: 30 min)
        BE->>BE: create_refresh_token (exp: 7 days)
        BE-->>FE: 200 { access_token, refresh_token }
        FE->>LS: localStorage.setItem("access_token", token)
        FE->>User: Redirect → /dashboard
    else Invalid credentials
        BE-->>FE: 401 { detail: "Incorrect username or password" }
        FE->>User: Show error message
    end

    Note over FE,BE: Every subsequent request

    FE->>BE: GET /api/v1/services\nAuthorization: Bearer <token>
    BE->>BE: decode_token() → sub, role, exp
    alt Token expired
        BE-->>FE: 401 Unauthorized
        FE->>LS: localStorage.removeItem("access_token")
        FE->>User: Redirect → /login
    else Token valid
        BE->>PG: query...
        PG-->>BE: data
        BE-->>FE: 200 data
    end
```

---

### 9b. Anomaly Detected → RCA → Dashboard Update

```mermaid
sequenceDiagram
    participant SCHED as Scheduler (60s timer)
    participant PROM as Prometheus
    participant JAEGER as Jaeger
    participant DET as AnomalyDetector
    participant RCA as RCAEngine
    participant REPO as Repository
    participant PG as PostgreSQL
    participant FE as Frontend (React)
    participant BE as Backend

    SCHED->>PROM: PromQL: rate(http_request_duration_seconds_bucket[5m])
    PROM-->>SCHED: latency_p99 = 2.8s
    SCHED->>PROM: PromQL: rate(http_requests_total{status=~"5.."}[5m])
    PROM-->>SCHED: error_rate = 0.72

    SCHED->>DET: score(ServiceMetrics{cpu=0.9, mem=210, lat=2.8, err=0.72})
    DET->>DET: append to rolling buffer (deque maxlen=120)
    DET->>DET: Z-score check → spike=True (lat z=4.1)
    DET->>DET: IsolationForest.fit(buffer) → raw=-0.42
    DET->>DET: norm_score = clip(0.5 - (-0.42)) = 0.92
    DET-->>SCHED: AnomalyResult(score=0.92, is_anomaly=True, spike=True)

    SCHED->>JAEGER: GET /api/traces?service=demo-app&lookback=15m
    JAEGER-->>SCHED: spans: [payment.db.query 2400ms error=true, ...]

    SCHED->>RCA: analyze(["demo-app"], trace_data)
    RCA->>RCA: Rule A — highest child latency: payment.db.query avg=2400ms
    RCA->>RCA: Rule B — child errors: payment.db.query err_rate=0.90
    RCA->>RCA: deduplicate + sort by confidence
    RCA-->>SCHED: RCAResult(source="demo-app", top="payment-db", confidence=0.93)

    SCHED->>REPO: save_anomaly_result(AnomalyResult)
    REPO->>PG: INSERT INTO anomaly_results (service_id, score=0.92, is_anomaly=true)

    SCHED->>REPO: save_rca_result(RCAResult)
    REPO->>PG: INSERT INTO rca_results (service_id, root_cause, confidence=0.93)

    Note over FE,BE: Frontend polling (30s interval)

    FE->>BE: GET /api/v1/dashboard/summary
    BE->>PG: SELECT COUNT(*) FROM anomaly_results WHERE detected_at > NOW()-24h
    PG-->>BE: recent_anomalies_24h = 24
    BE-->>FE: { recent_anomalies_24h: 24, ... }
    FE->>FE: Re-render StatCard "Anomalies (24h)" = 24
```

---

### 9c. Demo Scenario Start → Metrics Change → Detection

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant DEMO as Demo App (FastAPI :8080)
    participant CTRL as DemoController
    participant SCEN as Scenario Coroutine
    participant PROM as Prometheus
    participant AI as AI Engine

    Dev->>DEMO: POST /demo/cascading_failure/start
    DEMO->>CTRL: DemoController.get().start("cascading_failure", fn)
    CTRL->>CTRL: cancel previous scenario (if any)
    CTRL->>SCEN: asyncio.create_task(demo_cascading_failure(s))
    CTRL-->>DEMO: ActiveScenario { phase=1, label="db_slow" }
    DEMO-->>Dev: 200 { started: "cascading_failure" }

    Note over SCEN: Phase 1 (0–30s): db_slow

    SCEN->>SCEN: s.effect.order_extra_latency = 0.50s
    SCEN->>DEMO: _traffic() fires GET /api/orders, GET /api/payments, POST /api/orders (3 concurrent)
    DEMO->>DEMO: _latency("order") → asyncio.sleep(0.05 + 0.50)
    DEMO-->>SCEN: HTTP 200 (slow)

    PROM->>DEMO: scrape /metrics (every 10s)
    DEMO-->>PROM: http_request_duration_seconds_bucket latency=0.55s

    Note over SCEN: Phase 2 (30–60s): timeouts_starting

    SCEN->>SCEN: order_extra_latency=1.50, error_prob=0.25
    DEMO->>DEMO: _error("order") → random() < 0.25 → HTTPException 500
    PROM->>DEMO: scrape /metrics
    DEMO-->>PROM: error_rate spike visible

    Note over AI: AI Engine fires (60s cycle)

    AI->>PROM: PromQL: latency_p99 → 1.8s
    AI->>PROM: PromQL: error_rate → 0.28
    AI->>AI: AnomalyDetector.score() → 0.74 > threshold(0.70)
    AI->>AI: save_anomaly_result(score=0.74, is_anomaly=True)

    Note over SCEN: Phase 3 (60s+): full_cascade — score → 0.90
```

---

## 10. Class Diagram (Biểu đồ lớp)

### 10a. Backend — ORM Models & Relations

```mermaid
classDiagram
    class User {
        +UUID id
        +str email
        +str username
        +str hashed_password
        +UserRole role
        +bool is_active
        +datetime last_login_at
    }

    class Service {
        +UUID id
        +str name
        +ServiceStatus status
        +str prometheus_job
        +str namespace
        +str team
        +dict tags
    }

    class Incident {
        +UUID id
        +str title
        +AlertSeverity severity
        +IncidentStatus status
        +UUID service_id
        +UUID assigned_to
        +datetime started_at
        +datetime resolved_at
        +int duration_seconds
    }

    class Alert {
        +UUID id
        +UUID service_id
        +UUID incident_id
        +str alert_name
        +AlertSeverity severity
        +AlertStatus status
        +str fingerprint
        +float metric_value
        +datetime fired_at
    }

    class AnomalyResult {
        +UUID id
        +UUID service_id
        +float anomaly_score
        +bool is_anomaly
        +str model_name
        +dict raw_data_snapshot
        +datetime detected_at
    }

    class RCAResult {
        +UUID id
        +UUID incident_id
        +UUID service_id
        +UUID root_cause_service_id
        +str root_cause
        +dict contributing_factors
        +dict causal_graph
        +float confidence_score
        +RCAStatus status
    }

    class Report {
        +UUID id
        +UUID generated_by
        +UUID incident_id
        +ReportType report_type
        +ReportStatus status
        +dict content
    }

    class AuditLog {
        +UUID id
        +UUID user_id
        +AuditAction action
        +str resource_type
        +UUID resource_id
        +dict old_values
        +dict new_values
    }

    User "1" --o "0..*" Incident : assigned_to
    User "1" --o "0..*" Report : generated_by
    User "1" --o "0..*" AuditLog : user_id
    Service "1" --o "0..*" Incident : service_id
    Service "1" --o "0..*" Alert : service_id
    Service "1" --o "0..*" AnomalyResult : service_id
    Service "1" --o "0..*" RCAResult : service_id
    Incident "1" --o "0..*" Alert : incident_id
    Incident "1" --o "0..*" RCAResult : incident_id
    Incident "1" --o "0..*" Report : incident_id
    AnomalyResult "1" --o "0..1" RCAResult : anomaly_id
```

---

### 10b. AI Engine — Detection & RCA Classes

```mermaid
classDiagram
    class ServiceMetrics {
        +str service
        +float cpu_rate
        +float memory_mb
        +float latency_p99_s
        +float error_rate
    }

    class AnomalyResult_AI {
        +str service
        +float anomaly_score
        +bool is_anomaly
        +bool spike_detected
        +dict features
        +str method
        +str detail
    }

    class AnomalyDetector {
        -float _threshold
        -int _min_samples
        -dict _buffers
        +score(metrics: ServiceMetrics) AnomalyResult
        -_buffer_for(service: str) deque
        -_detect_spike(buf, current) bool
        -_isolation_forest_score(...) AnomalyResult
        -_threshold_fallback(...) AnomalyResult
    }

    class RootCauseCandidate {
        +str service
        +float confidence
        +str reason
        +dict evidence
    }

    class RCAResult_AI {
        +str source_service
        +list candidates
        +str summary
    }

    class RCAEngine {
        +analyze(anomalous_services, trace_data) list~RCAResult~
        -_analyze_service(service, trace) RCAResult
        -_rule_a_highest_latency() RootCauseCandidate
        -_rule_b_child_errors() RootCauseCandidate
        -_rule_c_self_anomaly() RootCauseCandidate
    }

    class TraceMetrics {
        +str service
        +int trace_count
        +float avg_duration_ms
        +float p99_duration_ms
        +int error_count
        +list spans
    }

    class Span {
        +str service_name
        +str operation_name
        +int duration_us
        +bool has_error
        +dict tags
    }

    class ForecastResult {
        +str service
        +str trend
        +float peak_cpu
        +float r_squared
        +list forecast_points
    }

    AnomalyDetector --> ServiceMetrics : consumes
    AnomalyDetector --> AnomalyResult_AI : produces
    RCAEngine --> TraceMetrics : consumes
    RCAEngine --> RCAResult_AI : produces
    RCAResult_AI "1" --o "1..3" RootCauseCandidate : candidates
    TraceMetrics "1" --o "0..*" Span : spans
```

---

### 10c. Demo App — Scenario Controller

```mermaid
classDiagram
    class ScenarioEffect {
        +float order_extra_latency
        +float payment_extra_latency
        +float order_error_prob
        +float payment_error_prob
        +int order_error_code
        +int payment_error_code
        +float cpu_burn_seconds
    }

    class ActiveScenario {
        +str name
        +str description
        +datetime started_at
        +Task task
        +ScenarioEffect effect
        +int phase
        +str phase_label
        -list _memory_bloat
    }

    class DemoController {
        -DemoController _inst
        -ActiveScenario _active
        -Lock _lock
        +get()$ DemoController
        +start(name, description, fn) ActiveScenario
        +stop() str
        +status() dict
        -_cancel_current() str
        -_wrap(fn) None
    }

    class SCENARIO_REGISTRY {
        +basic_anomaly: tuple
        +performance_issue: tuple
        +error_spike: tuple
        +intermittent_failure: tuple
        +dependency_failure: tuple
        +cascading_failure: tuple
        +wow_rca: tuple
    }

    DemoController "1" --o "0..1" ActiveScenario : _active
    ActiveScenario "1" --> "1" ScenarioEffect : effect
    DemoController --> SCENARIO_REGISTRY : looks up
```

---

## 11. Use Case Diagram (Biểu đồ ca sử dụng)

```mermaid
flowchart LR
    ADMIN(["👤 Admin"])
    ANALYST(["👤 Analyst"])
    VIEWER(["👤 Viewer"])
    AIENG(["🤖 AI Engine"])
    DEMOAPP(["⚙️ Demo App"])

    subgraph Auth ["🔐 Authentication"]
        UC1(["Login / Logout"])
        UC2(["Refresh Token"])
    end

    subgraph Dashboard ["📊 Dashboard"]
        UC3(["View KPI Summary"])
        UC4(["View Alert Bar Chart"])
        UC5(["View Service Health"])
    end

    subgraph Services ["🖥️ Services"]
        UC6(["View Service List"])
        UC7(["Create Service"])
        UC8(["Edit Service"])
        UC9(["Delete Service"])
    end

    subgraph Incidents ["🚨 Incidents"]
        UC10(["View Incidents"])
        UC11(["Create Incident"])
        UC12(["Resolve Incident"])
        UC13(["View RCA Report"])
        UC14(["Assign Incident"])
    end

    subgraph Metrics ["📈 Metrics"]
        UC15(["View Live CPU Chart"])
        UC16(["View Latency Chart"])
        UC17(["View Error Rate"])
    end

    subgraph AISystem ["🤖 AI System (automated)"]
        UC18(["Ingest Prometheus Metrics"])
        UC19(["Detect Anomaly — IsolationForest"])
        UC20(["Run RCA — Trace Analysis"])
        UC21(["Forecast CPU Trend"])
        UC22(["Persist Results to DB"])
    end

    subgraph Demo ["🎭 Demo Scenarios"]
        UC23(["Start Scenario"])
        UC24(["Stop Scenario"])
        UC25(["View Scenario Status"])
        UC26(["Generate Synthetic Traffic"])
    end

    ADMIN --> UC1 & UC3 & UC4 & UC5
    ADMIN --> UC6 & UC7 & UC8 & UC9
    ADMIN --> UC10 & UC11 & UC12 & UC13 & UC14
    ADMIN --> UC15 & UC16 & UC17
    ADMIN --> UC23 & UC24 & UC25

    ANALYST --> UC1 & UC3 & UC4 & UC5
    ANALYST --> UC6 & UC7 & UC8
    ANALYST --> UC10 & UC11 & UC12 & UC13 & UC14
    ANALYST --> UC15 & UC16 & UC17
    ANALYST --> UC23 & UC24 & UC25

    VIEWER --> UC1 & UC3 & UC4 & UC5
    VIEWER --> UC6
    VIEWER --> UC10 & UC13
    VIEWER --> UC15 & UC16 & UC17
    VIEWER --> UC25

    AIENG --> UC18 & UC19 & UC20 & UC21 & UC22
    DEMOAPP --> UC26
    UC26 -.->|"generates metrics for"| UC18
```
