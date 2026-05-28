"""
Async email service using smtplib in a thread pool.
Call send_anomaly_alert() from notification triggers.
"""

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings

logger = logging.getLogger(__name__)


def _build_anomaly_email(to: str, service: str, score: float, level: str, detail: str) -> MIMEMultipart:
    settings = get_settings()
    subject = f"[AIOps] {level.upper()} anomaly detected on {service} (score={score:.3f})"

    html = f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#111827;font-family:Inter,Arial,sans-serif;color:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#111827;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0"
           style="background:#1f2937;border-radius:8px;border:1px solid #374151;overflow:hidden;">

      <!-- Header -->
      <tr><td style="background:#1d4ed8;padding:20px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">
              ⚡ AIOps Platform
            </td>
            <td align="right">
              <span style="background:rgba(255,255,255,0.15);color:#fff;
                           padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">
                {level.upper()}
              </span>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Alert banner -->
      <tr><td style="background:#7f1d1d;padding:12px 32px;">
        <p style="margin:0;color:#fca5a5;font-size:13px;font-weight:500;">
          🔴 Anomaly detected — immediate attention may be required
        </p>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 24px;color:#f9fafb;font-size:18px;font-weight:600;">
          Anomaly Alert: <span style="color:#60a5fa;">{service}</span>
        </h2>

        <!-- Score card -->
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#111827;border-radius:6px;border:1px solid #374151;
                      margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;border-right:1px solid #374151;">
              <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
                Anomaly Score
              </p>
              <p style="margin:0;color:#f87171;font-size:28px;font-weight:700;">{score:.3f}</p>
              <p style="margin:4px 0 0;color:#6b7280;font-size:11px;">threshold: 0.70</p>
            </td>
            <td style="padding:16px 20px;border-right:1px solid #374151;">
              <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
                Service
              </p>
              <p style="margin:0;color:#f9fafb;font-size:16px;font-weight:600;">{service}</p>
            </td>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
                Severity
              </p>
              <p style="margin:0;color:#fbbf24;font-size:16px;font-weight:600;">{level.upper()}</p>
            </td>
          </tr>
        </table>

        <!-- Detail -->
        <div style="background:#111827;border-radius:6px;border:1px solid #374151;
                    padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0 0 8px;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
            Detection Detail
          </p>
          <p style="margin:0;color:#d1d5db;font-size:13px;line-height:1.6;">{detail}</p>
        </div>

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0">
          <tr><td style="border-radius:6px;background:#1d4ed8;">
            <a href="http://localhost:3000/analytics"
               style="display:inline-block;padding:10px 24px;color:#fff;
                      font-size:13px;font-weight:600;text-decoration:none;">
              Open Analytics Dashboard →
            </a>
          </td></tr>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="border-top:1px solid #374151;padding:16px 32px;">
        <p style="margin:0;color:#6b7280;font-size:11px;">
          AIOps Platform · AI-based Software Performance Analysis System<br>
          You are receiving this because you have anomaly alerts enabled.
          Manage in <a href="http://localhost:3000/settings" style="color:#60a5fa;">Settings</a>.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))
    return msg


def _send_sync(to: str, service: str, score: float, level: str, detail: str) -> None:
    settings = get_settings()
    if not settings.smtp_user or not settings.smtp_password:
        logger.debug("SMTP not configured — skipping email to %s", to)
        return

    msg = _build_anomaly_email(to, service, score, level, detail)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_tls:
                smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.sendmail(settings.smtp_from, [to], msg.as_string())
        logger.info("Anomaly email sent → %s (service=%s score=%.3f)", to, service, score)
    except Exception:
        logger.warning("Failed to send anomaly email to %s", to, exc_info=True)


async def send_anomaly_alert(to: str, service: str, score: float, level: str, detail: str) -> None:
    """Non-blocking — runs SMTP in a thread so it doesn't block the event loop."""
    await asyncio.to_thread(_send_sync, to, service, score, level, detail)
