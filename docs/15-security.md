# 15 — Security

## Authentication Model

The system uses **JWT (JSON Web Token)** with two token types:

| Token | Expiry | Claim: type | Purpose |
|---|---|---|---|
| Access token | 30 minutes | `"access"` | Authenticate API requests |
| Refresh token | 7 days | `"refresh"` | Obtain new access tokens |

Both tokens are signed with HS256 using the `SECRET_KEY` from environment variables.

---

## JWT Structure

**Access token payload:**
```json
{
  "sub": "aaaaaaaa-0000-0000-0000-000000000001",
  "role": "admin",
  "type": "access",
  "exp": 1746001800
}
```

**Refresh token payload:**
```json
{
  "sub": "aaaaaaaa-0000-0000-0000-000000000001",
  "type": "refresh",
  "exp": 1746605000
}
```

The `type` claim prevents a refresh token from being used as an access token and vice versa. The `refresh` endpoint explicitly checks `payload["type"] == "refresh"` before issuing a new token.

---

## Password Security

Passwords are hashed with **bcrypt** (cost factor 12) using passlib:

```python
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
```

`pwd_context.verify` uses **constant-time comparison** — the time taken does not reveal whether the prefix of the password is correct. This prevents timing attacks.

Plaintext passwords are never stored, logged, or included in API responses.

---

## Role-Based Access Control (RBAC)

Three roles enforce least-privilege access:

```
admin
  ├── Everything analyst can do
  ├── User management (CRUD)
  ├── Delete incidents
  └── Delete services

analyst
  ├── Everything viewer can do
  ├── Create/update services, alerts, incidents
  ├── Resolve incidents
  └── Generate reports

viewer
  ├── Read all resources (services, alerts, incidents, reports, metrics, dashboard)
  └── No write operations
```

RBAC is enforced in FastAPI via the `require_roles()` dependency:

```python
# In router — dependency runs before the handler
@router.post("/", dependencies=[Depends(require_roles("admin", "analyst"))])
async def create_incident(payload: IncidentCreate, db: DBSession):
    ...
```

```python
# In core/deps.py
def require_roles(*roles: str):
    async def check(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
    return check
```

The role is read from the **JWT payload** — no additional DB lookup required for each request. The token is signed, so the role cannot be tampered with without invalidating the signature.

---

## Request Authentication Flow

```
1. Client sends: Authorization: Bearer <access_token>
2. OAuth2PasswordBearer extracts token from header
3. decode_token(token):
   - Verifies HS256 signature using SECRET_KEY
   - Checks expiry (exp claim)
   - Returns payload dict
4. If type != "access" → raise 401
5. db.get(User, UUID(payload["sub"]))
   - If user not found or not active → raise 401
6. Return User object to handler
```

---

## CORS

CORS is configured in `main.py` via `CORSMiddleware`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,   # from CORS_ORIGINS env var
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

`CORS_ORIGINS` must be set to the exact frontend origin (default: `http://localhost:3000`). Multiple origins are comma-separated. The system never sets `allow_origins=["*"]`.

---

## SQL Injection Prevention

All database queries use SQLAlchemy ORM or parameterised `text()` queries. No f-string SQL construction exists in the codebase.

```python
# Correct (parameterised)
await db.execute(
    text("SELECT COUNT(*) FROM anomaly_results WHERE detected_at >= :cutoff"),
    {"cutoff": cutoff}
)

# This pattern is banned
await db.execute(f"SELECT ... WHERE email = '{email}'")  # NEVER do this
```

---

## Secrets Management

| Secret | Stored in | Rotated by |
|---|---|---|
| `SECRET_KEY` | `.env` (local), environment variable (prod) | Manual — restart backend after rotation |
| `POSTGRES_PASSWORD` | `.env` | Manual — update postgres + all services |
| `GRAFANA_ADMIN_PASSWORD` | `.env` | Grafana admin UI or restart |

Rules:
- `.env` is gitignored — never committed
- No secrets in `docker-compose.yml` (only variable references like `${SECRET_KEY:?err}`)
- `:?err` syntax in Compose fails fast if a required secret is not set
- No secrets in source code — all read via `get_settings()` from pydantic-settings

---

## Network Security

- `db-net` and `monitoring-net` are `internal: true` — no outbound internet routing
- The database (5432) is not exposed to the host in any non-development configuration
- Only the frontend network has internet access
- OTel Collector ports (4317/4318) are exposed for external OTLP senders but accept all input — restrict with firewall rules in production

---

## Known Limitations (out of scope for thesis)

| Limitation | Production mitigation |
|---|---|
| Tokens stored in `localStorage` | Use `HttpOnly` cookies to prevent XSS token theft |
| No token revocation | Use short-lived tokens + token blacklist (Redis) |
| Single SECRET_KEY | Use RS256 with rotating key pairs |
| HTTP (no TLS) | Terminate TLS at Nginx/Traefik reverse proxy |
| No rate limiting on login endpoint | Add `slowapi` or nginx limit_req |
| No CSRF protection | Needed if switching to cookie-based auth |
