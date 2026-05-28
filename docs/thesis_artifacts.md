# AIOps – AI-based Software Performance Analysis System
## Graduation Thesis: System Design Artifacts

**Institution:** University of Information Technology  
**Project Title:** AIOps – AI-based Software Performance Analysis System  
**Academic Year:** 2025–2026  

---

## Table of Contents

1. [Use Case Diagram](#1-use-case-diagram)
2. [Sequence Diagrams](#2-sequence-diagrams)
3. [Activity Diagram](#3-activity-diagram)
4. [Deployment Diagram](#4-deployment-diagram)
5. [Class Diagram](#5-class-diagram)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Risk Analysis](#8-risk-analysis)
9. [Testing Strategy](#9-testing-strategy)

---

## 1. Use Case Diagram

### 1.1 Actor Definitions

| Actor | Description |
|---|---|
| **Admin** | Full system access: user management, all CRUD operations, delete incidents |
| **Analyst** | Operational role: create/update incidents and alerts, generate reports, view all data |
| **Viewer** | Read-only: view dashboard, incidents, metrics, services |
| **AI Engine** | Automated system actor: ingests metrics, runs detection, persists anomaly/RCA results |
| **Demo App** | Instrumented microservice that emits OpenTelemetry traces and Prometheus metrics |

### 1.2 PlantUML Source

```plantuml
@startuml AIOps_UseCaseDiagram
left to right direction
skinparam actorStyle awesome
skinparam packageStyle rectangle
skinparam backgroundColor #1e1e2e
skinparam ArrowColor #7c7cba
skinparam ActorBorderColor #89b4fa
skinparam UseCaseBorderColor #cba6f7

actor Admin      as ADM  #89b4fa
actor Analyst    as ANL  #a6e3a1
actor Viewer     as VWR  #f9e2af
actor "AI Engine" as AIE #f38ba8
actor "Demo App"  as DEM #fab387

rectangle "Authentication" {
  usecase "Login"            as UC01
  usecase "Refresh Token"    as UC02
  usecase "Logout"           as UC03
}

rectangle "User Management" {
  usecase "Manage Users"     as UC04
  usecase "Change Role"      as UC05
  usecase "Deactivate User"  as UC06
}

rectangle "Service Registry" {
  usecase "Register Service" as UC07
  usecase "Update Service"   as UC08
  usecase "Delete Service"   as UC09
  usecase "View Services"    as UC10
}

rectangle "Monitoring & Metrics" {
  usecase "View Real-time Metrics"  as UC11
  usecase "View Dashboard KPIs"     as UC12
  usecase "Query Prometheus"        as UC13
}

rectangle "Alert Management" {
  usecase "Create Alert"     as UC14
  usecase "Acknowledge Alert" as UC15
  usecase "Resolve Alert"    as UC16
  usecase "Filter Alerts"    as UC17
}

rectangle "Incident Management" {
  usecase "Create Incident"  as UC18
  usecase "Update Incident"  as UC19
  usecase "Resolve Incident" as UC20
  usecase "Delete Incident"  as UC21
  usecase "View RCA Results" as UC22
}

rectangle "AI / Anomaly Engine" {
  usecase "Ingest Prometheus Metrics" as UC23
  usecase "Ingest Jaeger Traces"      as UC24
  usecase "Run Anomaly Detection"     as UC25
  usecase "Execute RCA Analysis"      as UC26
  usecase "Forecast CPU Usage"        as UC27
  usecase "Persist AI Results"        as UC28
}

rectangle "Reporting" {
  usecase "Generate Report"  as UC29
  usecase "Download Report"  as UC30
  usecase "List Reports"     as UC31
}

' Admin
ADM --> UC01
ADM --> UC04
ADM --> UC05
ADM --> UC06
ADM --> UC07
ADM --> UC08
ADM --> UC09
ADM --> UC14
ADM --> UC18
ADM --> UC19
ADM --> UC20
ADM --> UC21
ADM --> UC29
ADM --> UC30

' Analyst
ANL --> UC01
ANL --> UC07
ANL --> UC08
ANL --> UC14
ANL --> UC15
ANL --> UC16
ANL --> UC18
ANL --> UC19
ANL --> UC20
ANL --> UC29
ANL --> UC30

' Viewer (read-only)
VWR --> UC01
VWR --> UC10
VWR --> UC11
VWR --> UC12
VWR --> UC17
VWR --> UC22
VWR --> UC31

' All authenticated users
ADM --> UC02
ANL --> UC02
VWR --> UC02
ADM --> UC03
ANL --> UC03
VWR --> UC03

' AI Engine automated
AIE --> UC23
AIE --> UC24
AIE --> UC25
AIE --> UC26
AIE --> UC27
AIE --> UC28

' Demo App
DEM --> UC23
DEM --> UC24

' Include relationships
UC11 ..> UC13 : <<include>>
UC12 ..> UC13 : <<include>>
UC25 ..> UC26 : <<extend>> (if anomaly detected)
UC26 ..> UC28 : <<include>>
UC25 ..> UC28 : <<include>>

@enduml
```

### 1.3 Use Case Summary Table

| ID | Use Case | Primary Actor | Priority |
|---|---|---|---|
| UC01 | Login with credentials | All Users | High |
| UC02 | Refresh JWT token | All Users | High |
| UC04 | Manage Users (CRUD) | Admin | High |
| UC07 | Register Service | Admin, Analyst | High |
| UC11 | View Real-time Metrics | All Users | High |
| UC12 | View Dashboard KPIs | All Users | High |
| UC14 | Create Alert | Admin, Analyst | High |
| UC18 | Create Incident | Admin, Analyst | High |
| UC20 | Resolve Incident | Admin, Analyst | High |
| UC22 | View RCA Results | All Users | High |
| UC23 | Ingest Prometheus Metrics | AI Engine | High |
| UC25 | Run Anomaly Detection | AI Engine | High |
| UC26 | Execute RCA Analysis | AI Engine | High |
| UC27 | Forecast CPU Usage | AI Engine | Medium |
| UC29 | Generate Report | Admin, Analyst | Medium |

---

## 2. Sequence Diagrams

### 2.1 User Authentication Flow

```plantuml
@startuml SD_Authentication
skinparam sequenceMessageAlign center
skinparam backgroundColor #1e1e2e

actor       "User (Browser)"     as USR
participant "React Frontend"     as FE
participant "FastAPI Backend"    as BE
participant "PostgreSQL"         as DB
participant "JWT Module"         as JWT

USR  -> FE  : Enter email + password\nClick "Sign In"
FE   -> BE  : POST /api/v1/auth/login\n{ email, password }
BE   -> DB  : SELECT * FROM users\nWHERE email = ?
DB   --> BE : User record (hashed_password, role, is_active)
BE   -> BE  : bcrypt.verify(password, hashed_password)
alt Password invalid or user inactive
    BE --> FE : 401 Unauthorized\n{ detail: "Invalid credentials" }
    FE --> USR : Show error toast
else Password valid
    BE -> JWT : create_access_token(sub=user.id, role=user.role)
    JWT --> BE : access_token (exp: 30 min)
    BE -> JWT : create_refresh_token(sub=user.id)
    JWT --> BE : refresh_token (exp: 7 days)
    BE --> FE : 200 OK\n{ access_token, refresh_token, token_type }
    FE -> FE  : localStorage.setItem(tokens)
    FE -> FE  : Decode JWT payload → { id, role }
    FE --> USR : Redirect to /dashboard
end

... (token expires) ...

FE   -> BE  : POST /api/v1/auth/refresh\n{ refresh_token }
BE   -> JWT : decode_token(refresh_token)
JWT --> BE  : Payload { sub, type: "refresh" }
alt type ≠ "refresh" or expired
    BE --> FE : 401 Unauthorized
    FE --> USR : Redirect to /login
else Valid refresh token
    BE -> JWT : create_access_token(sub)
    JWT --> BE : new access_token
    BE --> FE  : 200 OK { access_token, refresh_token }
    FE -> FE   : Update localStorage
end

@enduml
```

---

### 2.2 Anomaly Detection and RCA Pipeline (AI Engine)

```plantuml
@startuml SD_AnomalyPipeline
skinparam backgroundColor #1e1e2e
skinparam sequenceMessageAlign center

participant "Scheduler (1-min)"   as SCH
participant "Worker"              as WRK
participant "PrometheusIngester"  as PRO
participant "JaegerIngester"      as JAG
participant "AnomalyDetector"     as DET
participant "RCAEngine"           as RCA
participant "CpuForecaster"       as FOR
participant "Repository"          as REP
database    "PostgreSQL"          as DB

SCH  -> WRK : run_pipeline_once()

group Stage 1: Metric Ingestion
    WRK -> PRO : fetch_current_metrics(services)
    PRO -> PRO : GET /api/v1/query ×4\n(cpu, mem, latency_p99, error_rate)
    PRO --> WRK : List[ServiceMetrics]

    WRK -> JAG : fetch_trace_metrics(services, window=5m)
    JAG -> JAG : GET /api/traces\nparse spans, errors, durations
    JAG --> WRK : Dict[str, TraceMetrics]
end

group Stage 2: Anomaly Detection
    loop for each ServiceMetrics
        WRK -> DET : score(metrics)
        DET -> DET : Append to rolling buffer (maxlen=120)
        DET -> DET : z-score spike detection
        alt Buffer < 20 samples
            DET -> DET : threshold_fallback()\n(CPU>0.8, latency>1s, err>10%)
        else Buffer ≥ 20 samples
            DET -> DET : IsolationForest.fit(buffer)\n.decision_function(features)
            DET -> DET : score = clip(0.5 − raw, 0, 1)
        end
        DET --> WRK : AnomalyResult(score, is_anomaly, method)
    end
end

group Stage 3: Root Cause Analysis (anomalous services only)
    WRK -> WRK : anomalous = [r for r in results if r.is_anomaly]
    WRK -> RCA : analyze(anomalous_services, trace_data)
    loop for each anomalous service
        RCA -> RCA : Rule A: child with max avg_duration
        RCA -> RCA : Rule B: child services with errors
        RCA -> RCA : Rule C: self-anomaly (no child evidence)
        RCA -> RCA : Deduplicate, sort by confidence, top 3
    end
    RCA --> WRK : List[RCAResult]
end

group Stage 4: CPU Forecasting
    WRK -> PRO : fetch_cpu_history(window=60m)
    PRO --> WRK : List[(timestamp, cpu_rate)]
    WRK -> FOR : forecast_cpu(history)
    FOR -> FOR : PolynomialFeatures(degree=2)\n+ LinearRegression
    FOR --> WRK : List[(future_ts, predicted_cpu)]
end

group Stage 5: Persistence
    WRK -> REP : save_anomaly_result(anomaly)
    REP -> DB  : INSERT INTO anomaly_results
    DB --> REP : OK

    WRK -> REP : save_rca_result(rca)
    REP -> DB  : SELECT id FROM incidents\nWHERE status='open' AND service matches
    DB --> REP : incident_id (nullable)
    REP -> DB  : INSERT INTO rca_results (linked to incident)
    DB --> REP : OK

    WRK -> REP : save_forecast(forecasts)
    REP -> DB  : INSERT INTO forecasts
    DB --> REP : OK
end

SCH <-- WRK : Pipeline complete

@enduml
```

---

### 2.3 Incident Lifecycle: Create → View RCA → Resolve

```plantuml
@startuml SD_IncidentLifecycle
skinparam backgroundColor #1e1e2e

actor       "Analyst"         as ANL
participant "React Frontend"  as FE
participant "FastAPI Backend" as BE
database    "PostgreSQL"      as DB

ANL -> FE : Open Incidents page
FE  -> BE : GET /api/v1/incidents?status=open\n[Authorization: Bearer <token>]
BE  -> BE : Validate JWT (type=access)
BE  -> DB : SELECT incidents ORDER BY started_at DESC
DB --> BE : List[Incident]
BE --> FE : 200 OK Page[IncidentRead]
FE --> ANL : Render incident table

ANL -> FE : Click "New Incident"
FE --> ANL : Show CreateIncidentModal

ANL -> FE : Fill form + Submit
FE  -> BE : POST /api/v1/incidents\n{ title, severity, service_id, ... }
BE  -> BE : require_roles("admin","analyst") → OK
BE  -> DB : INSERT INTO incidents
DB --> BE : Incident row (id, started_at, status=open)
BE --> FE : 201 Created IncidentRead
FE --> ANL : Show success toast\nRefresh table

ANL -> FE : Click incident row → Open detail modal
FE  -> BE : GET /api/v1/incidents/{id}/rca
BE  -> DB : SELECT * FROM rca_results\nWHERE incident_id = ?
DB --> BE : List[RcaResult]
BE --> FE : 200 OK { incident_id, results }
FE --> ANL : Render RCA panel\n(root cause, confidence, evidence)

ANL -> FE : Click "Resolve"
FE  -> BE : POST /api/v1/incidents/{id}/resolve
BE  -> BE : Check status ≠ resolved/closed
BE  -> DB : UPDATE incidents SET status='resolved',\nresolved_at=NOW()
DB --> BE : Updated row
BE  -> BE : DB trigger recomputes\nduration_seconds (COMPUTED column)
BE --> FE : 200 OK IncidentRead (status=resolved)
FE --> ANL : Badge turns green\nDuration displayed

@enduml
```

---

## 3. Activity Diagram

### 3.1 AI Engine One-Minute Pipeline

```plantuml
@startuml AD_AIPipeline
skinparam backgroundColor #1e1e2e
skinparam ActivityBorderColor #cba6f7
skinparam ActivityBackgroundColor #313244
skinparam ArrowColor #89b4fa

start
:Scheduler fires every 60 seconds;

:Fetch current metrics from Prometheus\n(cpu_rate, memory_mb, latency_p99, error_rate);

:Fetch trace data from Jaeger\n(spans, durations, error flags);

fork
  :Process service: backend;
fork again
  :Process service: demo-app;
end fork

:For each service — Run AnomalyDetector.score();

if (Buffer size < min_samples ?) then (yes)
  :Threshold fallback scoring\n(heuristic rules);
else (no)
  :Fit IsolationForest on rolling buffer;
  :Compute normalized anomaly score ∈ [0, 1];
end if

:Spike detection via z-score (threshold = 3.0);

if (score > threshold OR spike_detected ?) then (anomalous)
  :Mark service as ANOMALOUS;
  :Run RCA Engine analysis;
  :Rule A — highest child latency;
  :Rule B — child services with errors;
  if (No child evidence ?) then (yes)
    :Rule C — self-anomaly (confidence = 0.50);
  end if
  :Rank candidates by confidence, keep top 3;
  :Persist RCAResult → rca_results table\n(linked to open incident if exists);
else (normal)
  :Mark service as NORMAL;
endif

:Fetch CPU history (last 60 minutes);
:Fit Polynomial Regression (degree 2);
:Generate 30-minute CPU forecast;

:Persist AnomalyResult → anomaly_results;
:Persist Forecast → forecasts;

:Log pipeline completion + timing;
stop

@enduml
```

### 3.2 User Login and Dashboard Access

```plantuml
@startuml AD_UserLogin
skinparam backgroundColor #1e1e2e

start
:User navigates to application URL;

if (JWT token in localStorage ?) then (yes)
  :Decode JWT payload;
  if (Token expired ?) then (yes)
    :Send refresh request;
    if (Refresh valid ?) then (yes)
      :Issue new access token;
    else (no)
      :Clear localStorage;
      :Redirect to /login;
      stop
    endif
  endif
  :Route to /dashboard;
else (no)
  :Render Login page;
  :User enters email + password;
  :POST /api/v1/auth/login;
  if (Credentials valid ?) then (yes)
    :Store access + refresh tokens;
    :Redirect to /dashboard;
  else (no)
    :Show error toast;
    :Allow retry;
  endif
endif

:Dashboard loads;
:Poll /api/v1/dashboard/summary every 30s;
:Render KPI cards, alert chart, service grid;

fork
  :User navigates to Metrics;
  :Poll /api/v1/metrics/current every 10s;
  :Accumulate CPU/latency history (Recharts);
fork again
  :User navigates to Incidents;
  :Fetch paginated incident list;
  :User clicks row → Open modal;
  :Fetch RCA results for incident;
fork again
  :User navigates to Services;
  :Fetch service list;
  :CRUD operations (Admin/Analyst only);
end fork

stop

@enduml
```

---

## 4. Deployment Diagram

### 4.1 Docker Compose Infrastructure

```plantuml
@startuml DD_Deployment
skinparam backgroundColor #1e1e2e
skinparam NodeBorderColor #89b4fa
skinparam componentBorderColor #cba6f7
skinparam ArrowColor #a6e3a1

node "Docker Host (localhost)" {

  node "aiops-network (bridge)" {

    node "frontend\n[Vite + React : 3000]" as FE {
      component "React SPA"
      component "Axios HTTP Client"
      component "Recharts"
    }

    node "backend\n[FastAPI + Uvicorn : 8000]" as BE {
      component "REST API (8 routers)"
      component "JWT Auth"
      component "SQLAlchemy (asyncpg)"
      component "OTel SDK"
    }

    node "ai-engine\n[FastAPI + Uvicorn : 8001]" as AI {
      component "Anomaly Detector"
      component "RCA Engine"
      component "CPU Forecaster"
      component "60s Scheduler"
    }

    node "demo-app\n[FastAPI : 8002]" as DEMO {
      component "Synthetic workload generator"
      component "OTel SDK"
    }

    node "postgres\n[PostgreSQL 16 : 5432]" as PG {
      database "aiops (primary schema)"
    }

    node "prometheus\n[Prometheus : 9090]" as PROM {
      component "Metric scraper"
      component "Time-series TSDB"
    }

    node "grafana\n[Grafana : 3001]" as GRAF {
      component "Dashboard UI"
      component "Prometheus datasource"
    }

    node "otel-collector\n[OTel Contrib : 4317/4318/8888]" as OTEL {
      component "OTLP Receiver (gRPC)"
      component "OTLP Receiver (HTTP)"
      component "Prometheus Exporter"
      component "Jaeger Exporter"
    }

    node "jaeger\n[Jaeger : 16686/14268]" as JAE {
      component "Trace Store"
      component "Query UI"
    }
  }
}

' Data flows
FE   --> BE   : HTTP /api/v1/** (port 8000)
BE   --> PG   : asyncpg (port 5432)
BE   --> PROM : HTTP /api/v1/query (port 9090)
AI   --> PG   : psycopg2 (port 5432)
AI   --> PROM : HTTP /api/v1/query (port 9090)
AI   --> JAE  : HTTP /api/traces (port 16686)
BE   --> OTEL : OTLP gRPC (port 4317)
AI   --> OTEL : OTLP gRPC (port 4317)
DEMO --> OTEL : OTLP gRPC (port 4317)
OTEL --> JAE  : Jaeger exporter (port 14268)
OTEL --> PROM : Prometheus exporter (port 8888)
PROM --> GRAF : Prometheus datasource
DEMO --> PROM : /metrics scrape (port 8000)
BE   --> PROM : /metrics scrape (port 8000)

note bottom of FE : User Browser\naccessible at localhost:3000
note bottom of GRAF : Ops Dashboard\naccessible at localhost:3001
note bottom of JAE  : Trace Explorer\naccessible at localhost:16686

@enduml
```

### 4.2 Port Reference

| Container | Service | Exposed Port | Protocol |
|---|---|---|---|
| frontend | React SPA | 3000 | HTTP |
| backend | FastAPI REST API | 8000 | HTTP |
| ai-engine | FastAPI + Scheduler | 8001 | HTTP |
| demo-app | Synthetic workload | 8002 | HTTP |
| postgres | PostgreSQL 16 | 5432 | TCP |
| prometheus | Metrics TSDB | 9090 | HTTP |
| grafana | Visualization | 3001 | HTTP |
| otel-collector | OTLP gRPC receiver | 4317 | gRPC |
| otel-collector | OTLP HTTP receiver | 4318 | HTTP |
| otel-collector | Internal metrics | 8888 | HTTP |
| jaeger | Query UI | 16686 | HTTP |
| jaeger | Thrift/HTTP collector | 14268 | HTTP |

---

## 5. Class Diagram

### 5.1 Domain Model (Backend)

```plantuml
@startuml CD_DomainModel
skinparam backgroundColor #1e1e2e
skinparam ClassBorderColor #cba6f7
skinparam ClassBackgroundColor #313244
skinparam ArrowColor #89b4fa

class User {
  +id: UUID
  +email: str
  +username: str
  +hashed_password: str
  +role: UserRole
  +is_active: bool
  +created_at: datetime
  +updated_at: datetime
  --
  +reports: List[Report]
}

enum UserRole {
  admin
  analyst
  viewer
}

class Service {
  +id: UUID
  +name: str
  +type: ServiceType
  +environment: str
  +description: str | None
  +base_url: str | None
  +metadata_: dict
  +status: ServiceStatus
  +created_at: datetime
  +updated_at: datetime
  --
  +alerts: List[Alert]
  +incidents: List[Incident]
}

enum ServiceType {
  web
  api
  database
  cache
  queue
  worker
  other
}

enum ServiceStatus {
  healthy
  degraded
  down
  unknown
}

class Alert {
  +id: UUID
  +service_id: UUID
  +incident_id: UUID | None
  +name: str
  +severity: AlertSeverity
  +status: AlertStatus
  +labels: dict
  +annotations: dict
  +fingerprint: str | None
  +message: str | None
  +fired_at: datetime | None
  +resolved_at: datetime | None
  +created_at: datetime
  +updated_at: datetime
  --
  +service: Service
  +incident: Incident | None
}

enum AlertSeverity {
  critical
  high
  medium
  low
}

enum AlertStatus {
  firing
  resolved
  acknowledged
  pending
}

class Incident {
  +id: UUID
  +service_id: UUID | None
  +title: str
  +description: str | None
  +severity: AlertSeverity
  +status: IncidentStatus
  +started_at: datetime
  +resolved_at: datetime | None
  +duration_seconds: int | None  <<computed>>
  +tags: list[str]
  +created_at: datetime
  +updated_at: datetime
  --
  +service: Service | None
  +alerts: List[Alert]
}

enum IncidentStatus {
  open
  investigating
  resolved
  closed
}

class Report {
  +id: UUID
  +generated_by: UUID | None
  +title: str
  +report_type: ReportType
  +format: ReportFormat
  +status: ReportStatus
  +parameters: dict
  +content: str | None
  +file_path: str | None
  +created_at: datetime
  +updated_at: datetime
  --
  +generated_by_user: User | None
}

enum ReportType {
  incident_report
  performance_report
  anomaly_report
  capacity_report
}

User       "1" -- "0..*" Report     : generates >
Service    "1" -- "0..*" Alert      : triggers >
Service    "1" -- "0..*" Incident   : affects >
Incident   "1" -- "0..*" Alert      : groups >
User       ..  UserRole
Service    ..  ServiceType
Service    ..  ServiceStatus
Alert      ..  AlertSeverity
Alert      ..  AlertStatus
Incident   ..  AlertSeverity
Incident   ..  IncidentStatus
Report     ..  ReportType

@enduml
```

### 5.2 AI Engine Class Diagram

```plantuml
@startuml CD_AIEngine
skinparam backgroundColor #1e1e2e
skinparam ClassBorderColor #f38ba8
skinparam ClassBackgroundColor #313244
skinparam ArrowColor #a6e3a1

class Settings {
  +database_url: str
  +prometheus_url: str
  +jaeger_url: str
  +anomaly_score_threshold: float
  +min_isolation_forest_samples: int
  +monitored_services: str
  --
  +monitored_services_list: List[str]
  +get_settings(): Settings <<lru_cache>>
}

class ServiceMetrics {
  +service: str
  +cpu_rate: float
  +memory_mb: float
  +latency_p99_s: float
  +error_rate: float
  +timestamp: float
}

class TraceMetrics {
  +service: str
  +trace_count: int
  +error_count: int
  +p99_duration_ms: float
  +spans: List[Span]
}

class Span {
  +trace_id: str
  +span_id: str
  +service_name: str
  +operation_name: str
  +duration_us: int
  +has_error: bool
}

class AnomalyResult {
  +service: str
  +anomaly_score: float
  +is_anomaly: bool
  +spike_detected: bool
  +features: dict
  +method: str
  +detail: str
}

class AnomalyDetector {
  -_threshold: float
  -_min_samples: int
  -_buffers: dict[str, deque[ndarray]]
  --
  +score(metrics: ServiceMetrics): AnomalyResult
  -_buffer_for(service: str): deque
  -_detect_spike(buf, current): bool
  -_isolation_forest_score(...): AnomalyResult
  -_threshold_fallback(...): AnomalyResult
  -_feature_dict(features): dict
}

class RootCauseCandidate {
  +service: str
  +confidence: float
  +reason: str
  +evidence: dict
}

class RCAResult {
  +source_service: str
  +candidates: List[RootCauseCandidate]
  +summary: str
}

class RCAEngine {
  +analyze(anomalous: List[str],\n  trace_data: dict): List[RCAResult]
  -_analyze_service(service, tm): RCAResult
}

class CpuForecastPoint {
  +timestamp: float
  +predicted_cpu: float
}

class CpuForecaster {
  +forecast_cpu(history: list): List[CpuForecastPoint]
}

class Repository {
  +save_anomaly_result(result: AnomalyResult)
  +save_rca_result(result: RCAResult,\n  anomaly: AnomalyResult)
  +save_forecast(service: str,\n  points: List[CpuForecastPoint])
}

class PrometheusIngester {
  +fetch_current_metrics(\n  services: List[str]): List[ServiceMetrics]
  +fetch_cpu_history(\n  service: str, window_min: int): list
  -_query(client, promql): float | None
  -_instant(results: list): float | None
}

class JaegerIngester {
  +fetch_trace_metrics(\n  services: List[str],\n  window_min: int): dict[str, TraceMetrics]
}

class Worker {
  -_detector: AnomalyDetector
  -_rca_engine: RCAEngine
  +run_pipeline_once()
}

Worker --> PrometheusIngester : uses
Worker --> JaegerIngester     : uses
Worker --> AnomalyDetector    : uses
Worker --> RCAEngine          : uses
Worker --> CpuForecaster      : uses
Worker --> Repository         : uses

AnomalyDetector ..> AnomalyResult    : produces
AnomalyDetector ..> ServiceMetrics   : consumes
RCAEngine       ..> RCAResult        : produces
RCAEngine       ..> TraceMetrics     : consumes
RCAResult       "1" *-- "1..*" RootCauseCandidate
TraceMetrics    "1" *-- "0..*" Span
CpuForecaster   ..> CpuForecastPoint : produces

@enduml
```

---

## 6. Functional Requirements

### 6.1 Authentication and Authorization

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-AUTH-01 | The system shall authenticate users via email/password and return JWT access token (30 min) and refresh token (7 days). | High | POST /auth/login returns tokens; invalid credentials return 401 |
| FR-AUTH-02 | The system shall enforce role-based access control with three roles: admin, analyst, viewer. | High | Endpoints restricted by role return 403 when unauthorized role accesses |
| FR-AUTH-03 | The system shall allow token refresh without re-authentication when the refresh token is valid. | High | POST /auth/refresh returns new access token; expired refresh returns 401 |
| FR-AUTH-04 | The system shall hash passwords using bcrypt before persisting to the database. | High | Plaintext passwords never stored; bcrypt hash verified on login |
| FR-AUTH-05 | Admin users shall be able to create, update, deactivate, and change roles of other users. | High | CRUD operations on /users restricted to admin role |

### 6.2 Service Registry

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-SVC-01 | The system shall maintain a registry of monitored services with name, type, environment, status, and metadata. | High | GET /services returns paginated list with all fields |
| FR-SVC-02 | Administrators and analysts shall be able to register new services with a unique name. | High | POST /services; duplicate name returns 409 Conflict |
| FR-SVC-03 | Service status shall reflect one of: healthy, degraded, down, unknown. | High | Status field constrained by DB enum; invalid values rejected |
| FR-SVC-04 | Service deletion shall cascade to remove associated alerts. | Medium | DELETE /services/{id}; associated alerts removed automatically |

### 6.3 Monitoring and Metrics

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-MET-01 | The system shall expose real-time per-service metrics (CPU, memory, latency p99, error rate) by proxying Prometheus queries. | High | GET /metrics/current returns current values within 10 seconds of poll |
| FR-MET-02 | The dashboard shall provide aggregate KPIs: total services, active alerts by severity, open incidents, MTTR, anomaly count. | High | GET /dashboard/summary returns all KPI fields with correct aggregation |
| FR-MET-03 | The frontend shall poll metrics every 10 seconds and maintain a rolling 50-point history for charting. | High | Charts update on each poll; no memory leak; stale-closure-safe via useRef |
| FR-MET-04 | The system shall expose Prometheus scrape endpoint on /metrics for backend and demo-app instrumentation. | Medium | Prometheus targets show UP status for all instrumented services |

### 6.4 Alert Management

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-ALR-01 | The system shall manage alerts with severity (critical/high/medium/low) and status (firing/acknowledged/resolved/pending). | High | Full lifecycle state transitions enforced |
| FR-ALR-02 | Alerts shall be associated with a service and optionally linked to an incident. | High | Foreign key constraints enforced; orphaned alert status preserved on service deletion |
| FR-ALR-03 | When a critical-severity alert fires, the system shall log a CRITICAL-level server event asynchronously. | Medium | Log entry present within 1 second of alert creation; does not block API response |
| FR-ALR-04 | Alerts shall support filtering by severity, status, and service_id via query parameters. | High | Query params applied correctly; pagination respected |

### 6.5 Incident Management

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-INC-01 | The system shall support full incident lifecycle: open → investigating → resolved → closed. | High | State transitions via PATCH and POST /resolve; invalid transitions rejected with 409 |
| FR-INC-02 | Incident duration shall be automatically computed as a PostgreSQL GENERATED ALWAYS column from (resolved_at − started_at). | High | duration_seconds populated automatically upon resolution; NULL for open incidents |
| FR-INC-03 | The system shall expose RCA results linked to an incident via GET /incidents/{id}/rca. | High | Returns up to 10 most recent RCA results ordered by created_at DESC |
| FR-INC-04 | Only admin and analyst roles shall create, update, or resolve incidents. | High | 403 returned for viewer role on mutating endpoints |
| FR-INC-05 | Only admin role shall delete incidents. | High | 403 returned for analyst and viewer on DELETE |

### 6.6 AI Engine — Anomaly Detection

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-AI-01 | The AI engine shall ingest Prometheus metrics for all configured services every 60 seconds. | High | Scheduler fires at ±2s precision; metrics fetched via HTTP |
| FR-AI-02 | The system shall detect anomalies using Isolation Forest trained on a rolling 120-sample buffer per service. | High | Anomaly score produced in [0,1] range; method field = "isolation_forest" |
| FR-AI-03 | During the warm-up period (< 20 samples), the system shall fall back to heuristic threshold scoring. | High | method field = "threshold_fallback"; no exception thrown during warm-up |
| FR-AI-04 | Spike detection using z-score (threshold = 3.0) shall operate independently of Isolation Forest and override anomaly=false. | High | spike_detected=true forces is_anomaly=true regardless of score |
| FR-AI-05 | The AI engine shall run Root Cause Analysis only on services flagged as anomalous. | High | RCA not called for normal services; rca_results row only inserted for anomalous ones |
| FR-AI-06 | RCA candidates shall be ranked by confidence score and limited to top 3 per anomalous service. | High | Candidates list length ≤ 3; sorted descending by confidence |

### 6.7 AI Engine — Forecasting

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-FC-01 | The system shall forecast CPU usage for the next 30 minutes using polynomial regression (degree 2) on the last 60 minutes of history. | Medium | 30 forecast points generated per service; each has timestamp and predicted_cpu |
| FR-FC-02 | Forecasts shall be persisted to the forecasts table after each pipeline run. | Medium | Rows inserted; queryable for Grafana dashboards |

### 6.8 Reporting

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-RPT-01 | The system shall support report types: incident_report, performance_report, anomaly_report, capacity_report. | Medium | report_type enum enforced; invalid type returns 422 |
| FR-RPT-02 | Reports shall track generation status: pending → generating → ready/failed. | Medium | Status transitions persisted; ready reports expose content or file_path |
| FR-RPT-03 | Report generation shall be restricted to admin and analyst roles. | Medium | 403 for viewer on POST /reports |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| ID | Requirement | Metric | Verification |
|---|---|---|---|
| NFR-PERF-01 | REST API endpoints shall respond within 500ms at p99 under normal load (≤ 50 concurrent users). | p99 latency < 500ms | Load test with Locust; 50 concurrent users, 5-minute soak |
| NFR-PERF-02 | Dashboard summary endpoint shall respond within 200ms (cached aggregation). | p95 < 200ms | Prometheus metric `http_request_duration_seconds` histogram |
| NFR-PERF-03 | AI engine pipeline shall complete within 30 seconds per cycle (well within the 60-second interval). | Pipeline duration < 30s | Worker timer log on each run |
| NFR-PERF-04 | The frontend shall achieve Time-to-Interactive (TTI) under 3 seconds on a standard broadband connection. | TTI < 3s | Lighthouse audit in production build mode |
| NFR-PERF-05 | Isolation Forest training shall complete within 2 seconds per service per pipeline cycle. | IsolationForest.fit < 2s | Timing instrumentation; 120 samples × 4 features |

### 7.2 Security

| ID | Requirement | Verification |
|---|---|---|
| NFR-SEC-01 | All API endpoints (except /auth/login and /health) shall require a valid JWT access token. | Automated test: unauthenticated request returns 401 |
| NFR-SEC-02 | JWT tokens shall use HS256 algorithm with a minimum 32-character secret key. | Code review: secret_key length validation at startup |
| NFR-SEC-03 | Passwords shall be hashed with bcrypt using a cost factor ≥ 12. | Security review: passlib CryptContext configuration |
| NFR-SEC-04 | The system shall not expose stack traces or internal errors in API responses in production. | Integration test: 500 errors return generic message only |
| NFR-SEC-05 | CORS shall be restricted to configured origins only. | Browser test: cross-origin requests from unlisted origins blocked |
| NFR-SEC-06 | Database credentials and JWT secrets shall be stored in environment variables, never in source code. | Code scan: no hardcoded secrets in committed files |
| NFR-SEC-07 | SQL injection shall be prevented by using parameterized queries (SQLAlchemy ORM exclusively). | Static analysis: no raw f-string SQL construction |

### 7.3 Reliability and Availability

| ID | Requirement | Metric |
|---|---|---|
| NFR-REL-01 | The system shall be available ≥ 99% uptime in the local deployment environment (Docker Compose restart policies). | `restart: unless-stopped` on all containers |
| NFR-REL-02 | The AI engine shall retry failed Prometheus and Jaeger HTTP requests up to 3 times with exponential backoff (tenacity). | Retry logic verified; pipeline continues on partial failure |
| NFR-REL-03 | The database connection pool shall recover from transient failures with up to 10 retry attempts at startup. | `init_db()` with @retry(stop_after_attempt(10)) |
| NFR-REL-04 | A failed AI pipeline cycle shall not crash the scheduler; the next cycle shall proceed normally. | Worker exception handling: try/except logs error and continues |

### 7.4 Maintainability

| ID | Requirement |
|---|---|
| NFR-MNT-01 | The codebase shall follow a clean, layered architecture: routers → schemas → models → database, with no circular imports. |
| NFR-MNT-02 | Database schema changes shall be managed exclusively through Alembic migrations; direct DDL modification is prohibited. |
| NFR-MNT-03 | All async SQLAlchemy models shall use SQLAlchemy 2.0 `Mapped` annotation style. |
| NFR-MNT-04 | Frontend components shall be stateless where possible; side effects isolated to hooks and context providers. |
| NFR-MNT-05 | All Docker services shall be configurable via environment variables without code changes. |

### 7.5 Observability

| ID | Requirement |
|---|---|
| NFR-OBS-01 | All three instrumented services (backend, ai-engine, demo-app) shall export OpenTelemetry traces to the OTel Collector via OTLP gRPC (port 4317). |
| NFR-OBS-02 | The backend and demo-app shall export Prometheus metrics on /metrics for scraping every 15 seconds. |
| NFR-OBS-03 | All containers shall emit structured JSON logs to stdout for Docker log collection. |
| NFR-OBS-04 | Distributed traces shall be viewable in Jaeger UI at localhost:16686 within 5 seconds of the HTTP request completing. |

### 7.6 Scalability

| ID | Requirement |
|---|---|
| NFR-SCA-01 | The AI engine shall support adding new monitored services by updating the `MONITORED_SERVICES` environment variable without code changes. |
| NFR-SCA-02 | The backend API shall be horizontally scalable (stateless design; no in-memory session state). |
| NFR-SCA-03 | The PostgreSQL schema shall use UUID primary keys and indexed foreign keys to support future data volume growth. |

---

## 8. Risk Analysis

### 8.1 Risk Register

| Risk ID | Risk Description | Category | Probability | Impact | Risk Score | Mitigation Strategy | Contingency |
|---|---|---|---|---|---|---|---|
| R-01 | Prometheus or Jaeger unavailable during AI pipeline cycle | Technical | Medium | High | **High** | Tenacity retry (3× with backoff); pipeline logs warning and continues with partial data | Pipeline skips unavailable source; anomaly detection proceeds with last known metrics |
| R-02 | Isolation Forest warm-up period produces inaccurate anomaly scores | ML/Accuracy | High | Medium | **High** | Threshold fallback active until 20 samples collected; warm-up state exposed in `method` field | Operators notified via `detail` field; false positive rate accepted during initial deployment window |
| R-03 | JWT secret key left as default "change-me-in-production" in deployment | Security | Medium | Critical | **Critical** | Secret key validation at startup; documentation requires .env override | Deployment blocked if default key detected in production environment check |
| R-04 | PostgreSQL connection pool exhaustion under concurrent load | Performance | Low | High | **Medium** | Async connection pooling with `async_sessionmaker`; pool_size configurable via env | Increase pool_size; add read replica for reporting queries |
| R-05 | OTel Collector scratch image has no healthcheck capability | Infrastructure | Confirmed | Low | **Low** | `condition: service_started` dependency; `restart: unless-stopped` | Collector restarts automatically; dependent services retry connections |
| R-06 | Polynomial regression CPU forecast diverges for non-stationary workloads | ML/Accuracy | Medium | Low | **Low** | Degree-2 polynomial limits extrapolation; 30-minute horizon minimizes drift | Expose confidence interval; label as "indicative only" in UI |
| R-07 | React state accumulation memory leak from polling intervals | Frontend | Low | Medium | **Medium** | `useRef` for history buffers; `clearInterval` in useEffect cleanup; bounded history (50 points) | Chrome DevTools heap snapshot in testing phase |
| R-08 | Alembic migration conflicts during parallel schema development | Development | Medium | Medium | **Medium** | Single-developer migration branch policy; sequential migration numbering | `alembic merge heads` to reconcile divergent migration histories |
| R-09 | bcrypt hash comparison timing attack | Security | Low | Medium | **Low** | `passlib.verify` uses constant-time comparison; no early exit | Already mitigated by passlib design |
| R-10 | Demo-app synthetic workload insufficient to trigger anomaly detection | Validation | Medium | High | **High** | Demo-app generates configurable error spikes and latency injection | Add chaos endpoint to manually force anomaly conditions during demo/defense |

### 8.2 Risk Matrix

```
           Impact
           Low        Medium     High       Critical
         ┌──────────┬──────────┬──────────┬──────────┐
High     │          │  R-02    │  R-01    │          │
Prob.    │          │          │          │          │
         ├──────────┼──────────┼──────────┼──────────┤
Medium   │  R-06    │  R-08    │          │  R-03    │
         │          │          │          │          │
         ├──────────┼──────────┼──────────┼──────────┤
Low      │  R-09    │  R-07    │  R-04    │          │
         │  R-05    │          │          │          │
         └──────────┴──────────┴──────────┴──────────┘
                                            R-10 (Medium/High)
```

---

## 9. Testing Strategy

### 9.1 Testing Pyramid Overview

```
                    ┌─────────────────┐
                    │   E2E Tests     │  ← Playwright / manual
                    │   (5–10%)       │
                   /└─────────────────┘\
                  /  ┌───────────────┐  \
                 /   │ Integration   │   \
                /    │  Tests (25%)  │    \
               /     └───────────────┘     \
              /    ┌─────────────────────┐   \
             /     │   Unit Tests (70%)  │    \
            /      └─────────────────────┘     \
```

### 9.2 Unit Testing

| Component | Test Scope | Tool | Key Scenarios |
|---|---|---|---|
| `AnomalyDetector` | `score()` method with synthetic feature vectors | pytest + numpy | (1) Warm-up threshold fallback < 20 samples; (2) Spike detected when z > 3.0; (3) IsolationForest scores known-anomalous vectors > threshold; (4) NaN/zero metrics handled gracefully |
| `RCAEngine` | `analyze()` with synthetic TraceMetrics | pytest | (1) Rule A fires for single high-latency child; (2) Rule B fires for child with errors; (3) Rule C (self-anomaly) when no child spans; (4) Deduplication keeps highest confidence; (5) Top 3 limit enforced |
| `CpuForecaster` | `forecast_cpu()` with synthetic history | pytest + sklearn | (1) Returns 30 points; (2) Predictions within plausible range; (3) Handles minimum 2-sample history |
| `security.py` | `hash_password`, `verify_password`, `create_access_token`, `decode_token` | pytest | (1) Hash is bcrypt format; (2) Verify correct password → True; wrong → False; (3) Token contains sub, type, exp; (4) Expired token raises exception |
| `deps.py` | `get_current_user`, `require_roles` | pytest + httpx | (1) Valid token → User object; (2) Access token type check; (3) Role mismatch → 403; (4) Expired token → 401 |
| `Badge.jsx` | Status badge variants | Vitest + React Testing Library | All 12+ status values render correct color classes |

### 9.3 Integration Testing

| Test Suite | Coverage | Tool | Setup |
|---|---|---|---|
| **Auth flow** | Login → token → refresh → 401 on expiry | pytest + httpx AsyncClient | In-memory SQLite or test PostgreSQL schema |
| **Incident CRUD** | Create → update → resolve; duration_seconds computed | pytest + httpx | Real PostgreSQL via Docker service in CI |
| **Alert filtering** | Query params `?severity=critical&status=firing` returns correct subset | pytest + httpx | Pre-seeded test data fixtures |
| **RCA endpoint** | `GET /incidents/{id}/rca` returns linked rca_results rows | pytest + httpx | AI engine persistence tested independently; mock rows inserted |
| **RBAC enforcement** | Each role tested against each restricted endpoint | pytest parametrize | JWT tokens with each role created via security.py |
| **Pagination** | `skip` and `limit` query params; `total` count correct | pytest + httpx | Fixture with 25 rows; test pages 1, 2, 3 |
| **Prometheus proxy** | `/metrics/current` returns expected structure | pytest + httpx | Mock httpx transport for Prometheus responses |

### 9.4 System / End-to-End Testing

| Scenario | Steps | Pass Criteria |
|---|---|---|
| **Full login flow** | Open `localhost:3000` → enter credentials → land on dashboard | Dashboard KPIs visible; no console errors |
| **Live metrics polling** | Open Metrics page → wait 30s | Chart updates ≥ 2 times; CPU and latency lines render correctly |
| **Incident creation and resolution** | Create incident as analyst → view RCA → resolve | Incident appears in table; status badge changes to "resolved"; duration_seconds populated |
| **RBAC UI enforcement** | Login as viewer → navigate to Services → try create | Create button absent; API returns 403 if called directly |
| **AI pipeline end-to-end** | Start demo-app with high error rate → wait 2 minutes | Anomaly result persisted in DB; RCA result linked to open incident |
| **OTel trace visibility** | Make 10 API calls → open Jaeger UI | All 10 traces visible; spans include database and HTTP child spans |

### 9.5 Performance Testing

| Test | Tool | Target | Method |
|---|---|---|---|
| API throughput under load | Locust | 50 concurrent users; p99 < 500ms | 5-minute soak on `/api/v1/dashboard/summary` |
| Frontend bundle size | Vite build + rollup-plugin-visualizer | < 500KB gzipped main bundle | `npm run build` output analysis |
| DB query performance | EXPLAIN ANALYZE | All paginated queries use index scan | Manual review of slow query log |
| AI pipeline timing | Python `time.perf_counter()` | Full pipeline < 30s | Logged on each run; averaged over 10 cycles |

### 9.6 Test Data Strategy

| Fixture | Description |
|---|---|
| `admin_user` | Seeded admin with known password; used across all auth tests |
| `analyst_user` | Seeded analyst; tests RBAC boundary |
| `viewer_user` | Seeded viewer; tests read-only enforcement |
| `active_service` | Service with status=healthy; parent for alerts and incidents |
| `open_incident` | Linked to active_service; used in RCA and resolve tests |
| `anomaly_metrics` | ServiceMetrics with cpu_rate=0.95, error_rate=0.20; known to trigger threshold fallback as anomalous |

### 9.7 CI / Quality Gates

| Gate | Tool | Threshold |
|---|---|---|
| Unit tests | pytest | 100% pass; 0 failures |
| Code coverage | pytest-cov | ≥ 80% line coverage on `app/` modules |
| Static type checking | mypy (backend) | 0 errors on `app/core`, `app/models`, `app/schemas` |
| Linting | ruff (backend), ESLint (frontend) | 0 errors; warnings reviewed |
| Dependency audit | pip-audit / npm audit | 0 known high/critical CVEs |
| Docker build | docker compose build | All images build without error |
| Migration check | alembic check | No pending migrations uncommitted |

---

## Appendix A: Database Schema Summary

| Table | Primary Key | Key Columns | Relationships |
|---|---|---|---|
| `users` | UUID | email, username, role, is_active | → reports |
| `services` | UUID | name, type, status, environment | → alerts, incidents |
| `alerts` | UUID | severity, status, fingerprint, fired_at | → service, incident |
| `incidents` | UUID | title, severity, status, duration_seconds (computed) | → service, alerts |
| `reports` | UUID | report_type, format, status, content | → user |
| `anomaly_results` | UUID | service_name, anomaly_score, method, is_anomaly | standalone |
| `rca_results` | UUID | incident_id (FK), root_cause_description, confidence_score, evidence | → incident |
| `forecasts` | UUID | service_name, forecast_horizon_min, data_points (JSONB) | standalone |

## Appendix B: API Endpoint Summary

| Method | Path | Role Required | Description |
|---|---|---|---|
| POST | /api/v1/auth/login | Public | Authenticate, receive JWT tokens |
| POST | /api/v1/auth/refresh | Public | Refresh access token |
| GET/POST/PATCH/DELETE | /api/v1/users | Admin | User management |
| GET/POST/PATCH/DELETE | /api/v1/services | Admin/Analyst (write), All (read) | Service registry |
| GET/POST/PATCH/DELETE | /api/v1/alerts | Admin/Analyst (write), All (read) | Alert management |
| GET/POST/PATCH/DELETE | /api/v1/incidents | Admin/Analyst (write), All (read) | Incident management |
| GET | /api/v1/incidents/{id}/rca | All | RCA results for incident |
| POST | /api/v1/incidents/{id}/resolve | Admin/Analyst | Resolve incident |
| GET | /api/v1/metrics/current | All | Real-time Prometheus metrics proxy |
| GET | /api/v1/dashboard/summary | All | Aggregated KPI summary |
| GET/POST | /api/v1/reports | Admin/Analyst (write), All (read) | Report management |
| GET | /health | Public | Liveness probe |
| GET | /api/v1/ping | Public | Readiness probe |

---

*Document version: 1.0 — Generated 2026-04-30*  
*All PlantUML diagrams can be rendered at plantuml.com or via VS Code PlantUML extension.*
