-- =============================================================================
-- AIOps Platform — Seed Data (development / demo)
-- Passwords: Admin@123 / Analyst@123 / Viewer@123 (bcrypt cost=12)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
INSERT INTO users (id, email, username, hashed_password, role) VALUES
(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'admin@aiops.local',
    'admin',
    '$2b$12$q23jaJcRequXizA.qYTmM.mx7NCI6usy8jChFRMc9LeQ8kOsIw6T.',
    'admin'
),
(
    'aaaaaaaa-0000-0000-0000-000000000002',
    'alice@aiops.local',
    'alice_analyst',
    '$2b$12$oJmMz3agyVvE.mGTzaT3te6vc5XdzejFxLWWh.obehRLNCquX/fYq',
    'analyst'
),
(
    'aaaaaaaa-0000-0000-0000-000000000003',
    'bob@aiops.local',
    'bob_viewer',
    '$2b$12$I.UR2v5.ZLo87qnn87pEd.Wnu.g/45.HK3TNntRFhZiUzZm0Oeyf6',
    'viewer'
);

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------
INSERT INTO services (id, name, type, environment, description, status, prometheus_job, namespace, team, base_url) VALUES
(
    'bbbbbbbb-0000-0000-0000-000000000001',
    'api-gateway',
    'api',
    'production',
    'Entry point — routes all external traffic to downstream services.',
    'healthy',
    'api-gateway',
    'prod',
    'platform',
    'http://api-gateway:8000'
),
(
    'bbbbbbbb-0000-0000-0000-000000000002',
    'auth-service',
    'api',
    'production',
    'Handles JWT issuance and validation.',
    'healthy',
    'auth-service',
    'prod',
    'platform',
    'http://auth-service:8001'
),
(
    'bbbbbbbb-0000-0000-0000-000000000003',
    'order-service',
    'api',
    'production',
    'Manages order lifecycle: creation, status tracking, cancellation.',
    'degraded',
    'order-service',
    'prod',
    'commerce',
    'http://order-service:8002'
),
(
    'bbbbbbbb-0000-0000-0000-000000000004',
    'payment-service',
    'api',
    'production',
    'Processes payments, refunds, and reconciliation.',
    'healthy',
    'payment-service',
    'prod',
    'commerce',
    'http://payment-service:8003'
),
(
    'bbbbbbbb-0000-0000-0000-000000000005',
    'notification-service',
    'worker',
    'production',
    'Sends emails, SMS, and push notifications.',
    'down',
    'notification-service',
    'prod',
    'platform',
    'http://notification-service:8004'
),
(
    'bbbbbbbb-0000-0000-0000-000000000006',
    'aiops-platform',
    'api',
    'production',
    'AIOps FastAPI backend service — monitored by AI engine.',
    'healthy',
    'aiops-platform',
    'prod',
    'platform',
    'http://backend:8000'
),
(
    'bbbbbbbb-0000-0000-0000-000000000007',
    'storefront-service',
    'api',
    'production',
    'E-commerce storefront service — handles orders and payments, monitored by AI engine.',
    'healthy',
    'storefront-service',
    'prod',
    'commerce',
    'http://demo-app:8080'
);

-- ---------------------------------------------------------------------------
-- Incidents
-- ---------------------------------------------------------------------------
INSERT INTO incidents (id, title, description, severity, status, service_id, started_at) VALUES
(
    'cccccccc-0000-0000-0000-000000000001',
    'High latency on order-service',
    'P99 latency spiked above 2000ms for the last 15 minutes. Downstream payment-service calls affected.',
    'high',
    'investigating',
    'bbbbbbbb-0000-0000-0000-000000000003',
    NOW() - INTERVAL '45 minutes'
),
(
    'cccccccc-0000-0000-0000-000000000002',
    'notification-service is down',
    'Service unreachable. Health check returning 503 for 20+ minutes. No emails or push notifications being delivered.',
    'critical',
    'open',
    'bbbbbbbb-0000-0000-0000-000000000005',
    NOW() - INTERVAL '25 minutes'
);

-- ---------------------------------------------------------------------------
-- Alerts
-- ---------------------------------------------------------------------------
INSERT INTO alerts (id, service_id, incident_id, name, severity, status, message, fingerprint, fired_at) VALUES
(
    'dddddddd-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000003',
    'cccccccc-0000-0000-0000-000000000001',
    'HighP99Latency',
    'high',
    'firing',
    'P99 request latency is 2347ms — exceeds 2000ms threshold.',
    'a1b2c3d4e5f67890a1b2c3d4e5f67890',
    NOW() - INTERVAL '45 minutes'
),
(
    'dddddddd-0000-0000-0000-000000000002',
    'bbbbbbbb-0000-0000-0000-000000000005',
    'cccccccc-0000-0000-0000-000000000002',
    'ServiceDown',
    'critical',
    'firing',
    'notification-service health check failed 3 consecutive times.',
    'b2c3d4e5f6789012b2c3d4e5f6789012',
    NOW() - INTERVAL '25 minutes'
),
(
    'dddddddd-0000-0000-0000-000000000003',
    'bbbbbbbb-0000-0000-0000-000000000003',
    'cccccccc-0000-0000-0000-000000000001',
    'HighErrorRate',
    'medium',
    'firing',
    'HTTP 5xx error rate is 4.2% — exceeds 1% threshold.',
    'c3d4e5f678901234c3d4e5f678901234',
    NOW() - INTERVAL '40 minutes'
);

-- ---------------------------------------------------------------------------
-- Anomaly Results
-- ---------------------------------------------------------------------------
INSERT INTO anomaly_results (id, service_id, metric_name, anomaly_score, is_anomaly, raw_value, metadata, detected_at) VALUES
(
    'eeeeeeee-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000003',
    'http_request_duration_seconds',
    0.94,
    TRUE,
    2.347,
    '{"method": "IsolationForest", "version": "1.3.0", "threshold": 0.70}',
    NOW() - INTERVAL '45 minutes'
),
(
    'eeeeeeee-0000-0000-0000-000000000002',
    'bbbbbbbb-0000-0000-0000-000000000005',
    'up',
    1.0,
    TRUE,
    0,
    '{"method": "IsolationForest", "version": "1.3.0", "threshold": 0.70}',
    NOW() - INTERVAL '25 minutes'
);

-- ---------------------------------------------------------------------------
-- RCA Results
-- ---------------------------------------------------------------------------
INSERT INTO rca_results (id, incident_id, service_id, root_cause_description, confidence_score, evidence) VALUES
(
    'ffffffff-0000-0000-0000-000000000001',
    'cccccccc-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000004',
    'payment-service is performing full table scans on the orders table due to a missing index introduced in deploy v2.4.1.',
    0.87,
    '[
        {"factor": "Missing DB index on orders.status column", "weight": 0.72, "evidence": "EXPLAIN ANALYZE shows Seq Scan"},
        {"factor": "Deploy v2.4.1 migration removed composite index", "weight": 0.21, "evidence": "git diff migrations/"},
        {"factor": "Traffic spike +35% at 14:00 UTC", "weight": 0.07, "evidence": "Prometheus request_rate metric"}
    ]'
);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
INSERT INTO reports (id, generated_by, title, report_type, format, status, parameters, content) VALUES
(
    '11111111-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002',
    'Incident Report — High latency on order-service',
    'incident_report',
    'json',
    'ready',
    '{"incident_id": "cccccccc-0000-0000-0000-000000000001"}',
    'A latency spike on order-service was traced to a missing DB index in payment-service after deploy v2.4.1. Estimated user impact: 12% of order requests experienced >2s latency for 45 minutes.'
);

-- ---------------------------------------------------------------------------
-- Audit Logs
-- ---------------------------------------------------------------------------
INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, ip_address) VALUES
(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'login',
    'user',
    'aaaaaaaa-0000-0000-0000-000000000001',
    '{}',
    '{"method": "password"}',
    '192.168.1.10'
),
(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'create',
    'incident',
    'cccccccc-0000-0000-0000-000000000001',
    '{}',
    '{"status": "open", "severity": "high"}',
    '192.168.1.10'
),
(
    'aaaaaaaa-0000-0000-0000-000000000002',
    'acknowledge',
    'alert',
    'dddddddd-0000-0000-0000-000000000001',
    '{"status": "firing"}',
    '{"status": "acknowledged"}',
    '192.168.1.11'
),
(
    'aaaaaaaa-0000-0000-0000-000000000002',
    'assign',
    'incident',
    'cccccccc-0000-0000-0000-000000000001',
    '{"assigned_to": null}',
    '{"assigned_to": "aaaaaaaa-0000-0000-0000-000000000002"}',
    '192.168.1.11'
);
