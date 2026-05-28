# 06 — Coding Standards

## Python (Backend + AI Engine)

### Imports
```python
# Order: stdlib → third-party → local (one blank line between each group)
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.core.deps import DBSession, get_current_user
from app.models.incident import Incident
```

### SQLAlchemy Models
Always use SQLAlchemy 2.0 `Mapped` annotation style. Never use the legacy `Column()` style.

```python
# Correct
class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    severity: Mapped[str] = mapped_column(Enum("critical", "high", ..., create_type=False))

# Wrong — never write this
class Incident(Base):
    id = Column(UUID, primary_key=True)
```

### Pydantic Schemas
```python
# Correct — use model_config, not class Config
class IncidentCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    title: str
    severity: Literal["critical", "high", "medium", "low"]
    service_id: uuid.UUID | None = None

# Wrong
class IncidentCreate(BaseModel):
    class Config:
        orm_mode = True
```

### FastAPI Dependencies
```python
# Correct — use Annotated for dependency injection
DBSession = Annotated[AsyncSession, Depends(get_db)]
AuthDep = Annotated[object, Depends(get_current_user)]

async def get_incident(incident_id: uuid.UUID, db: DBSession, _: AuthDep):
    ...

# Wrong — bare Depends triggers SonarLint S8410
async def get_incident(incident_id: uuid.UUID, db = Depends(get_db)):
    ...
```

### Error Handling
```python
# Correct — raise HTTPException with detail string constant
_NOT_FOUND = "Incident not found"

async def get_incident(incident_id: uuid.UUID, db: DBSession):
    incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return incident

# Wrong — inline string repeated 4× (SonarLint S1192)
raise HTTPException(status_code=404, detail="Incident not found")
```

### Comments
Write no comments by default. Add a comment only when the **why** is non-obvious:
```python
# Correct — explains a non-obvious invariant
score = float(np.clip(0.5 - raw, 0.0, 1.0))
# IsolationForest.decision_function is negative for anomalies, positive for normal.
# We invert and shift so score=0 means normal, score=1 means highly anomalous.

# Wrong — describes what the code obviously does
result = await db.get(Incident, incident_id)  # get incident by id
```

### Tenacity Retries
```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def fetch_current_metrics(services: list[str]) -> list[ServiceMetrics]:
    ...
```

---

## React / JavaScript

### Component Structure
```jsx
// Correct order: imports → interface → component → exports
import { useState } from 'react'
import { incidentsApi } from '@/api/incidents'
import Badge from '@/components/ui/Badge'

export default function IncidentModal({ incident, onClose }) {
  const [loading, setLoading] = useState(false)

  // event handlers before JSX
  async function handleResolve() { ... }

  return (
    <div>...</div>
  )
}
```

### Always Handle All States
```jsx
// Every data-fetching component must handle loading, error, and empty:
if (loading) return <Skeleton className="h-32 w-full rounded-lg" />
if (error) return <ErrorBanner message={error.message} />
if (items.length === 0) return <EmptyState message="No incidents yet" />

return <Table data={items} />
```

### API Calls
```jsx
// Correct — async/await in useEffect with cleanup flag
useEffect(() => {
  let cancelled = false
  async function load() {
    try {
      setLoading(true)
      const data = await incidentsApi.list()
      if (!cancelled) setItems(data.items)
    } catch (err) {
      if (!cancelled) addToast(err.message, 'error')
    } finally {
      if (!cancelled) setLoading(false)
    }
  }
  load()
  return () => { cancelled = true }
}, [])
```

### Polling
```jsx
// Always use usePolling — never raw setInterval in components
import usePolling from '@/hooks/usePolling'

usePolling(async () => {
  const data = await metricsApi.getCurrent()
  setCpuData(prev => [...prev.slice(-49), data.cpu])
}, 10_000)
```

### Class Names
```jsx
// Use cn() for conditional classes
import { cn } from '@/utils/cn'

<div className={cn(
  'rounded-lg border p-4',
  isActive ? 'border-blue-600 bg-blue-950/20' : 'border-zinc-800 bg-zinc-900'
)} />
```

### No Direct Tailwind Color Mixing
```jsx
// Correct — stick to zinc family
<p className="text-zinc-400">Secondary text</p>

// Wrong — mixing gray and zinc
<p className="text-gray-400">Secondary text</p>
```

---

## Database

### Enum Types
All enums are created in `schema.sql` using `CREATE TYPE`. SQLAlchemy models must reference them with `create_type=False`:
```python
Enum("admin", "analyst", "viewer", name="user_role", create_type=False)
```

### Raw SQL
Use raw SQL only when ORM cannot express the query (e.g., GENERATED columns, complex aggregations):
```python
# Acceptable — complex aggregation not expressible cleanly in ORM
from sqlalchemy import text
await db.execute(text("SELECT COUNT(*) FROM anomaly_results WHERE is_anomaly = true AND detected_at >= :cutoff"), {"cutoff": cutoff})
```

### Never use f-strings for SQL
```python
# Wrong — SQL injection risk
await db.execute(f"SELECT * FROM users WHERE email = '{email}'")

# Correct — parameterised
await db.execute(text("SELECT * FROM users WHERE email = :email"), {"email": email})
```

---

## Git Commit Messages

Format: `<type>(<scope>): <description>`

```
feat(incidents): add RCA endpoint GET /{id}/rca
fix(ai-engine): handle empty Jaeger response without crashing
refactor(frontend): extract usePolling hook from Metrics page
docs(readme): add quick-start instructions
chore(deps): pin scikit-learn to 1.5.0
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`

---

## What to Avoid

| Anti-pattern | Correct approach |
|---|---|
| `any` type in Python | Always annotate with concrete types or `TypeVar` |
| `except Exception: pass` | Log the exception; re-raise or return a meaningful result |
| Hardcoded secrets in source files | Read from `get_settings()` only |
| `print()` for logging | Use `logging.getLogger(__name__)` |
| Global mutable state in FastAPI | Use `lifespan` for init, dependency injection for shared resources |
| `style=` inline in JSX | Tailwind utility classes only |
| `useEffect` with missing deps | Always declare all deps or use `useCallback` correctly |
| Bare `Depends()` in function signature | Wrap in `Annotated` type alias |
| String literals repeated 3+ times | Extract to a named constant |
