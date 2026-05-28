"""
Synchronous email sender for AI engine (runs in a thread, no event loop).
Reads notification_settings from DB and sends SMTP emails on anomaly detection.
"""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy.orm import Session

from app.config import get_settings

logger = logging.getLogger(__name__)


def _score_to_level(score: float) -> str:
    if score >= 0.90:
        return "critical"
    if score >= 0.70:
        return "error"
    return "warn"


def _build_message(to: str, service: str, score: float, level: str, detail: str) -> MIMEMultipart:
    settings = get_settings()
    subject = f"[AIOps] {level.upper()} anomaly on {service} (score={score:.3f})"
    html = f"""
<html><body style="font-family:Arial,sans-serif;background:#111827;color:#f9fafb;padding:24px;">
<div style="max-width:600px;margin:0 auto;background:#1f2937;border-radius:8px;
            border:1px solid #374151;overflow:hidden;">
  <div style="background:#1d4ed8;padding:16px 24px;">
    <h2 style="margin:0;color:#fff;font-size:18px;">⚡ AIOps · Anomaly Alert</h2>
  </div>
  <div style="background:#7f1d1d;padding:10px 24px;">
    <p style="margin:0;color:#fca5a5;font-size:13px;">
      🔴 {level.upper()} anomaly detected on <strong>{service}</strong>
    </p>
  </div>
  <div style="padding:24px;">
    <table width="100%" style="background:#111827;border-radius:6px;border:1px solid #374151;
                               margin-bottom:20px;border-collapse:collapse;">
      <tr>
        <td style="padding:14px 18px;border-right:1px solid #374151;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-transform:uppercase;">Score</p>
          <p style="margin:0;color:#f87171;font-size:24px;font-weight:700;">{score:.3f}</p>
        </td>
        <td style="padding:14px 18px;border-right:1px solid #374151;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-transform:uppercase;">Service</p>
          <p style="margin:0;color:#f9fafb;font-size:16px;font-weight:600;">{service}</p>
        </td>
        <td style="padding:14px 18px;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-transform:uppercase;">Level</p>
          <p style="margin:0;color:#fbbf24;font-size:16px;font-weight:600;">{level.upper()}</p>
        </td>
      </tr>
    </table>
    <div style="background:#111827;border-radius:6px;border:1px solid #374151;padding:14px 18px;">
      <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;text-transform:uppercase;">Detail</p>
      <p style="margin:0;color:#d1d5db;font-size:13px;">{detail}</p>
    </div>
    <p style="margin:20px 0 0;">
      <a href="http://localhost:3000/analytics"
         style="background:#1d4ed8;color:#fff;padding:10px 20px;border-radius:6px;
                text-decoration:none;font-size:13px;font-weight:600;">
        Open Dashboard →
      </a>
    </p>
  </div>
  <div style="border-top:1px solid #374151;padding:14px 24px;">
    <p style="margin:0;color:#6b7280;font-size:11px;">
      AIOps Platform · Manage alerts at
      <a href="http://localhost:3000/settings" style="color:#60a5fa;">Settings</a>
    </p>
  </div>
</div>
</body></html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))
    return msg


def send_anomaly_emails(service: str, score: float, detail: str, session: Session) -> None:
    """
    Query all users with email_enabled=True whose min_score ≤ score,
    and whose level preference matches, then send SMTP emails.
    Called synchronously from the AI engine worker.
    """
    settings = get_settings()
    if not settings.smtp_user or not settings.smtp_password:
        logger.debug("SMTP not configured — skipping anomaly email notifications")
        return

    level = _score_to_level(score)

    try:
        from sqlalchemy import text as sql_text
        rows = session.execute(
            sql_text("""
                SELECT u.email, ns.min_score, ns.notify_critical, ns.notify_error, ns.notify_warn
                FROM notification_settings ns
                JOIN users u ON u.id = ns.user_id
                WHERE ns.email_enabled = true
                  AND u.is_active = true
                  AND ns.min_score <= :score
            """),
            {"score": score},
        ).fetchall()
    except Exception:
        logger.warning("Failed to query notification_settings", exc_info=True)
        return

    recipients = []
    for row in rows:
        email, min_score, crit, err, warn = row
        level_enabled = (level == "critical" and crit) or (level == "error" and err) or (level == "warn" and warn)
        if level_enabled:
            recipients.append(email)

    if not recipients:
        return

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_tls:
                smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
            for email in recipients:
                msg = _build_message(email, service, score, level, detail)
                smtp.sendmail(settings.smtp_from, [email], msg.as_string())
                logger.info("Anomaly email sent → %s (%s score=%.3f)", email, service, score)
                _log_notification(session, email, msg["Subject"], service, score)
    except Exception:
        logger.warning("SMTP error sending anomaly notifications", exc_info=True)


def _log_notification(session: Session, email: str, subject: str, service: str, score: float) -> None:
    try:
        from sqlalchemy import text as sql_text
        row = session.execute(
            sql_text("SELECT id FROM users WHERE email = :email LIMIT 1"),
            {"email": email},
        ).fetchone()
        if not row:
            return
        import uuid
        session.execute(
            sql_text("""
                INSERT INTO notification_logs (id, user_id, subject, service_name, anomaly_score, status)
                VALUES (:id, :user_id, :subject, :service, :score, 'sent')
            """),
            {"id": str(uuid.uuid4()), "user_id": str(row[0]),
             "subject": subject, "service": service, "score": score},
        )
    except Exception:
        logger.debug("Failed to log notification", exc_info=True)
