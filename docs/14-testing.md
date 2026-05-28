# 14 — Testing

## Testing Philosophy

The project follows the **testing pyramid**: many fast unit tests, fewer integration tests, minimal end-to-end tests. The AI engine core logic and security primitives get the most coverage because errors there cause silent failures that are hard to observe.

---

## Test Directory Layout

```
backend/
└── tests/
    ├── conftest.py           ← pytest fixtures (async client, test DB, seeded users)
    ├── unit/
    │   ├── test_security.py  ← hash_password, verify_password, token create/decode
    │   └── test_deps.py      ← get_current_user, require_roles
    └── integration/
        ├── test_auth.py      ← login, refresh, invalid credentials
        ├── test_incidents.py ← CRUD, resolve, RCA endpoint, RBAC
        ├── test_alerts.py    ← filtering, status transitions
        ├── test_services.py  ← CRUD, cascade delete
        └── test_dashboard.py ← summary aggregation

ai-engine/
└── tests/
    ├── conftest.py
    ├── test_anomaly.py       ← AnomalyDetector: warmup, spike, isolation_forest
    ├── test_rca.py           ← RCAEngine: Rule A/B/C, deduplication, top-3
    └── test_forecast.py      ← forecast_cpu: output length, plausible range

frontend/
└── src/
    └── __tests__/
        ├── Badge.test.jsx
        ├── usePolling.test.js
        └── AuthContext.test.jsx
```

---

## Running Tests

### Backend

```bash
cd backend

# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run all tests
pytest

# With coverage
pytest --cov=app --cov-report=term-missing

# Run a specific file
pytest tests/unit/test_security.py -v

# Run a specific test
pytest tests/integration/test_incidents.py::test_resolve_incident -v
```

### AI Engine

```bash
cd ai-engine
pip install pytest numpy scikit-learn
pytest tests/ -v
```

### Frontend

```bash
cd frontend
npm test               # Vitest watch mode
npm run test:run       # single run (CI)
npm run test:coverage  # with coverage report
```

---

## Backend Test Fixtures (`conftest.py`)

```python
@pytest.fixture
async def async_client():
    # Creates in-memory test DB, applies schema, yields httpx AsyncClient
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest.fixture
async def admin_token(async_client):
    resp = await async_client.post("/api/v1/auth/login",
        data={"username": "admin@test.local", "password": "Admin@123"})
    return resp.json()["access_token"]

@pytest.fixture
async def analyst_token(async_client): ...
@pytest.fixture
async def viewer_token(async_client): ...
```

---

## Key Unit Tests

### `test_security.py`

```python
def test_hash_is_bcrypt():
    h = hash_password("test")
    assert h.startswith("$2b$")

def test_verify_correct_password():
    h = hash_password("correct")
    assert verify_password("correct", h) is True

def test_verify_wrong_password():
    h = hash_password("correct")
    assert verify_password("wrong", h) is False

def test_access_token_contains_type_claim():
    token = create_access_token("user-id", "admin")
    payload = decode_token(token)
    assert payload["type"] == "access"
    assert payload["sub"] == "user-id"

def test_refresh_token_has_type_refresh():
    token = create_refresh_token("user-id")
    payload = decode_token(token)
    assert payload["type"] == "refresh"

def test_expired_token_raises():
    token = create_access_token("id", "admin", expires_delta=timedelta(seconds=-1))
    with pytest.raises(Exception):
        decode_token(token)
```

---

### `test_anomaly.py`

```python
def test_warmup_returns_threshold_fallback():
    detector = AnomalyDetector()
    metrics = ServiceMetrics("svc", cpu_rate=0.1, memory_mb=100, latency_p99_s=0.1, error_rate=0.01)
    result = detector.score(metrics)
    assert result.method == "threshold_fallback"

def test_spike_detection_overrides_normal_score():
    detector = AnomalyDetector()
    svc = "test-svc"
    # Fill buffer with normal values
    for _ in range(25):
        detector.score(ServiceMetrics(svc, 0.1, 100, 0.1, 0.01))
    # Feed a dramatic spike
    result = detector.score(ServiceMetrics(svc, 0.99, 100, 5.0, 0.5))
    assert result.spike_detected is True
    assert result.is_anomaly is True

def test_isolation_forest_used_after_warmup():
    detector = AnomalyDetector()
    for _ in range(21):
        detector.score(ServiceMetrics("svc", 0.1, 100, 0.1, 0.01))
    result = detector.score(ServiceMetrics("svc", 0.1, 100, 0.1, 0.01))
    assert result.method == "isolation_forest"

def test_score_is_bounded_01():
    detector = AnomalyDetector()
    for i in range(25):
        result = detector.score(ServiceMetrics("svc", 0.5, 200, 0.5, 0.05))
    assert 0.0 <= result.anomaly_score <= 1.0
```

---

### `test_rca.py`

```python
def test_rule_a_highest_child_latency():
    engine = RCAEngine()
    tm = TraceMetrics(service="api", spans=[
        Span("t1", "s1", "db-service", "query", duration_us=2_000_000, has_error=False),
        Span("t1", "s2", "cache",      "get",   duration_us=5_000, has_error=False),
    ], trace_count=1, error_count=0, p99_duration_ms=2000)
    results = engine.analyze(["api"], {"api": tm})
    assert results[0].candidates[0].service == "db-service"
    assert results[0].candidates[0].reason == "highest_child_latency"

def test_rule_c_self_anomaly_when_no_children():
    engine = RCAEngine()
    tm = TraceMetrics(service="worker", spans=[], trace_count=1, error_count=0, p99_duration_ms=100)
    results = engine.analyze(["worker"], {"worker": tm})
    assert results[0].candidates[0].service == "worker"
    assert results[0].candidates[0].reason == "self_anomaly"

def test_top_3_limit():
    engine = RCAEngine()
    spans = [Span("t", f"s{i}", f"child-{i}", "op", 100_000, i % 2 == 0) for i in range(10)]
    tm = TraceMetrics("api", spans, 10, 5, 100)
    results = engine.analyze(["api"], {"api": tm})
    assert len(results[0].candidates) <= 3
```

---

## Integration Test Examples

```python
async def test_login_success(async_client):
    resp = await async_client.post("/api/v1/auth/login",
        data={"username": "admin@aiops.local", "password": "Admin@123"})
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body

async def test_login_wrong_password(async_client):
    resp = await async_client.post("/api/v1/auth/login",
        data={"username": "admin@aiops.local", "password": "wrong"})
    assert resp.status_code == 401

async def test_viewer_cannot_create_incident(async_client, viewer_token):
    resp = await async_client.post("/api/v1/incidents",
        json={"title": "Test", "severity": "low", "status": "open"},
        headers={"Authorization": f"Bearer {viewer_token}"})
    assert resp.status_code == 403

async def test_resolve_sets_duration(async_client, analyst_token, open_incident_id):
    resp = await async_client.post(f"/api/v1/incidents/{open_incident_id}/resolve",
        headers={"Authorization": f"Bearer {analyst_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "resolved"
    assert data["duration_seconds"] is not None
    assert data["duration_seconds"] >= 0

async def test_resolve_already_resolved_returns_409(async_client, analyst_token, resolved_incident_id):
    resp = await async_client.post(f"/api/v1/incidents/{resolved_incident_id}/resolve",
        headers={"Authorization": f"Bearer {analyst_token}"})
    assert resp.status_code == 409
```

---

## CI Quality Gates

| Gate | Tool | Minimum bar |
|---|---|---|
| Unit tests | pytest | 100% pass |
| Integration tests | pytest + httpx | 100% pass |
| Line coverage (backend) | pytest-cov | ≥ 80% on `app/` |
| Line coverage (ai-engine) | pytest-cov | ≥ 80% on `app/` |
| Python linting | ruff | 0 errors |
| Type checking | mypy (core + models + schemas) | 0 errors |
| Frontend tests | Vitest | 100% pass |
| Docker build | docker compose build | 0 failures |
| Migration check | alembic check | No pending migrations |
