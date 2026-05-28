-- =============================================================================
-- AIOps Platform — PostgreSQL Schema
-- Engine: PostgreSQL 16
-- Authoritative source: aligned with SQLAlchemy models in backend/app/models/
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE user_role         AS ENUM ('admin', 'analyst', 'viewer');
CREATE TYPE service_type      AS ENUM ('web', 'api', 'database', 'cache', 'queue', 'worker', 'other');
CREATE TYPE service_status    AS ENUM ('healthy', 'degraded', 'down', 'unknown');
CREATE TYPE incident_severity AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE incident_status   AS ENUM ('open', 'investigating', 'resolved', 'closed');
CREATE TYPE alert_severity    AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE alert_status      AS ENUM ('firing', 'resolved', 'acknowledged', 'pending');
CREATE TYPE report_type       AS ENUM ('incident_report', 'performance_report', 'anomaly_report', 'capacity_report');
CREATE TYPE report_format     AS ENUM ('pdf', 'html', 'json');
CREATE TYPE report_status     AS ENUM ('pending', 'generating', 'ready', 'failed');
CREATE TYPE audit_action      AS ENUM (
    'create', 'update', 'delete',
    'login', 'logout',
    'acknowledge', 'resolve', 'assign', 'escalate'
);

-- ---------------------------------------------------------------------------
-- Shared trigger: auto-update updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- TABLE: users
-- ===========================================================================
CREATE TABLE users (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(100) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    role            user_role    NOT NULL DEFAULT 'viewer',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_users_email CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_role      ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ===========================================================================
-- TABLE: services
-- ===========================================================================
CREATE TABLE services (
    id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255)   NOT NULL UNIQUE,
    type            service_type   NOT NULL DEFAULT 'other',
    environment     VARCHAR(100)   NOT NULL DEFAULT 'production',
    description     TEXT,
    base_url        VARCHAR(500),
    metadata        JSONB          NOT NULL DEFAULT '{}',
    status          service_status NOT NULL DEFAULT 'unknown',
    -- extra operational columns (not mapped in model, safe to keep)
    prometheus_job  VARCHAR(100),
    namespace       VARCHAR(100)   NOT NULL DEFAULT 'default',
    team            VARCHAR(100),
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_services_status         ON services(status);
CREATE INDEX idx_services_type           ON services(type);
CREATE INDEX idx_services_environment    ON services(environment);
CREATE INDEX idx_services_prometheus_job ON services(prometheus_job);

CREATE TRIGGER trg_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ===========================================================================
-- TABLE: incidents  (declared before alerts — alerts FK → incidents)
-- ===========================================================================
CREATE TABLE incidents (
    id               UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id       UUID              NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    title            VARCHAR(500)      NOT NULL,
    description      TEXT,
    severity         incident_severity NOT NULL DEFAULT 'medium',
    status           incident_status   NOT NULL DEFAULT 'open',
    started_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    resolved_at      TIMESTAMPTZ,
    -- computed: NULL while open; populated when resolved_at is set
    duration_seconds INTEGER GENERATED ALWAYS AS (
        CASE WHEN resolved_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (resolved_at - started_at))::INTEGER
        ELSE NULL END
    ) STORED,
    tags             JSONB             NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_incidents_resolved_after_started CHECK (resolved_at IS NULL OR resolved_at >= started_at)
);

CREATE INDEX idx_incidents_service_id     ON incidents(service_id);
CREATE INDEX idx_incidents_status         ON incidents(status);
CREATE INDEX idx_incidents_severity       ON incidents(severity);
CREATE INDEX idx_incidents_started_at     ON incidents(started_at DESC);
CREATE INDEX idx_incidents_status_sev     ON incidents(status, severity);

CREATE TRIGGER trg_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ===========================================================================
-- TABLE: alerts
-- ===========================================================================
CREATE TABLE alerts (
    id          UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id  UUID           NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    incident_id UUID           REFERENCES incidents(id) ON DELETE SET NULL,
    name        VARCHAR(255)   NOT NULL,
    severity    alert_severity NOT NULL,
    status      alert_status   NOT NULL DEFAULT 'pending',
    labels      JSONB          NOT NULL DEFAULT '{}',
    annotations JSONB          NOT NULL DEFAULT '{}',
    fingerprint VARCHAR(255)   UNIQUE,
    message     TEXT,
    fired_at             TIMESTAMPTZ,
    resolved_at          TIMESTAMPTZ,
    acknowledged_at      TIMESTAMPTZ,
    acknowledged_by      VARCHAR(100),
    acknowledge_comment  TEXT,
    created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_service_id  ON alerts(service_id);
CREATE INDEX idx_alerts_incident_id ON alerts(incident_id);
CREATE INDEX idx_alerts_severity    ON alerts(severity);
CREATE INDEX idx_alerts_status      ON alerts(status);
-- Hot path: live firing alerts dashboard
CREATE INDEX idx_alerts_firing ON alerts(service_id, fired_at DESC) WHERE status = 'firing';

CREATE TRIGGER trg_alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ===========================================================================
-- TABLE: anomaly_results  (written by AI engine, queried by backend dashboard)
-- ===========================================================================
CREATE TABLE anomaly_results (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id    UUID        REFERENCES services(id) ON DELETE CASCADE,
    metric_name   VARCHAR(255),
    anomaly_score FLOAT       NOT NULL,
    is_anomaly    BOOLEAN     NOT NULL DEFAULT FALSE,
    raw_value     FLOAT,
    metadata      JSONB       NOT NULL DEFAULT '{}',
    detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_anomaly_service_id  ON anomaly_results(service_id);
CREATE INDEX idx_anomaly_is_anomaly  ON anomaly_results(is_anomaly);
CREATE INDEX idx_anomaly_detected_at ON anomaly_results(detected_at DESC);

-- ===========================================================================
-- TABLE: rca_results  (written by AI engine, queried by incidents endpoint)
-- ===========================================================================
CREATE TABLE rca_results (
    id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id            UUID        REFERENCES incidents(id) ON DELETE CASCADE,
    service_id             UUID        REFERENCES services(id) ON DELETE CASCADE,
    root_cause_description TEXT,
    confidence_score       FLOAT,
    evidence               JSONB       NOT NULL DEFAULT '[]',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rca_incident_id ON rca_results(incident_id);
CREATE INDEX idx_rca_service_id  ON rca_results(service_id);

CREATE TRIGGER trg_rca_results_updated_at
    BEFORE UPDATE ON rca_results
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ===========================================================================
-- TABLE: reports
-- ===========================================================================
CREATE TABLE reports (
    id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    generated_by UUID          REFERENCES users(id) ON DELETE SET NULL,
    title        VARCHAR(500)  NOT NULL,
    report_type  report_type   NOT NULL,
    format       report_format NOT NULL DEFAULT 'json',
    status       report_status NOT NULL DEFAULT 'pending',
    parameters   JSONB         NOT NULL DEFAULT '{}',
    content      TEXT,
    file_path    VARCHAR(1000),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_generated_by ON reports(generated_by);
CREATE INDEX idx_reports_type         ON reports(report_type);
CREATE INDEX idx_reports_status       ON reports(status);
CREATE INDEX idx_reports_created_at   ON reports(created_at DESC);

CREATE TRIGGER trg_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ===========================================================================
-- TABLE: audit_logs  (append-only — no updated_at)
-- ===========================================================================
CREATE TABLE audit_logs (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID         REFERENCES users(id) ON DELETE SET NULL,
    action        audit_action NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id   UUID,
    old_values    JSONB        NOT NULL DEFAULT '{}',
    new_values    JSONB        NOT NULL DEFAULT '{}',
    ip_address    INET,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id   ON audit_logs(user_id);
CREATE INDEX idx_audit_resource  ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_action    ON audit_logs(action);
CREATE INDEX idx_audit_created   ON audit_logs(created_at DESC);

-- ===========================================================================
-- TABLE: notification_settings  (one row per user)
-- ===========================================================================
CREATE TABLE notification_settings (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    email_enabled   BOOLEAN      NOT NULL DEFAULT true,
    min_score       FLOAT        NOT NULL DEFAULT 0.70,
    notify_critical BOOLEAN      NOT NULL DEFAULT true,
    notify_error    BOOLEAN      NOT NULL DEFAULT true,
    notify_warn     BOOLEAN      NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user_id ON notification_settings(user_id);

CREATE TRIGGER trg_notif_settings_updated_at
    BEFORE UPDATE ON notification_settings
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ===========================================================================
-- TABLE: notification_logs  (audit trail of sent emails)
-- ===========================================================================
CREATE TABLE notification_logs (
    id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject          VARCHAR(500) NOT NULL,
    service_name     VARCHAR(255) NOT NULL,
    anomaly_score    FLOAT        NOT NULL,
    sent_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    status           VARCHAR(50)  NOT NULL DEFAULT 'sent'
);

CREATE INDEX idx_notif_log_user_id ON notification_logs(user_id);
CREATE INDEX idx_notif_log_sent_at ON notification_logs(sent_at DESC);

-- ===========================================================================
-- TABLE: global_settings  (singleton row id=1 — platform-wide config)
-- ===========================================================================
CREATE TABLE global_settings (
    id                          INTEGER      PRIMARY KEY DEFAULT 1,
    anomaly_score_threshold     FLOAT        NOT NULL DEFAULT 0.70,
    detection_interval_seconds  INTEGER      NOT NULL DEFAULT 60,
    alert_sound_enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
    browser_push_enabled        BOOLEAN      NOT NULL DEFAULT TRUE,
    escalation_enabled          BOOLEAN      NOT NULL DEFAULT FALSE,
    escalation_timeout_minutes  INTEGER      NOT NULL DEFAULT 30,
    routing_rules               JSONB        NOT NULL DEFAULT '[]',
    smtp_host                   VARCHAR(255) NOT NULL DEFAULT '',
    smtp_port                   INTEGER      NOT NULL DEFAULT 587,
    smtp_user                   VARCHAR(255) NOT NULL DEFAULT '',
    smtp_from                   VARCHAR(255) NOT NULL DEFAULT '',
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by                  VARCHAR(100),
    changelog                   TEXT,
    CONSTRAINT chk_global_settings_singleton CHECK (id = 1)
);
