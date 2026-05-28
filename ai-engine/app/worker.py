"""
Detection worker — runs every DETECTION_INTERVAL_SECONDS.

Pipeline per cycle:
  1. Ingest: fetch current metrics from Prometheus + trace data from Jaeger
  2. Detect:  score each service with AnomalyDetector (Isolation Forest)
  3. RCA:     run RCAEngine on anomalous services
  4. Forecast: predict CPU usage for next 30 min
  5. Persist: write results to PostgreSQL
"""

import logging
import time

from app.config import get_settings
from app.detection.anomaly import AnomalyDetector
from app.forecasting.cpu_forecast import forecast_cpu
from app.ingestion.jaeger import fetch_trace_metrics
from app.ingestion.prometheus import fetch_current_metrics, fetch_cpu_history
from app.persistence.repository import save_anomaly_result, save_forecast, save_rca_result
from app.rca.engine import RCAEngine

logger = logging.getLogger(__name__)

# Module-level singletons — created once, reused every cycle to preserve buffers
_detector = AnomalyDetector()
_rca_engine = RCAEngine()


def run_detection_cycle() -> None:
    settings = get_settings()
    services = settings.monitored_services_list

    logger.info("Detection cycle started (services=%s)", services)
    t_start = time.perf_counter()

    # ------------------------------------------------------------------ 1. Ingest
    metrics_list = fetch_current_metrics(services)
    if not metrics_list:
        logger.warning("No metrics returned from Prometheus — skipping cycle")
        return

    # ------------------------------------------------------------------ 2. Detect
    anomaly_results = []
    anomalous_services = []

    for metrics in metrics_list:
        result = _detector.score(metrics)
        anomaly_results.append(result)
        if result.is_anomaly:
            anomalous_services.append(metrics.service)
            logger.warning(
                "ANOMALY [%s] score=%.4f spike=%s method=%s",
                result.service, result.anomaly_score, result.spike_detected, result.method,
            )
        else:
            logger.debug(
                "Normal  [%s] score=%.4f method=%s",
                result.service, result.anomaly_score, result.method,
            )

    # ------------------------------------------------------------------ 3. RCA
    rca_results = []
    if anomalous_services:
        trace_data = fetch_trace_metrics(anomalous_services, lookback_minutes=15)
        rca_results = _rca_engine.analyze(anomalous_services, trace_data)

    # ------------------------------------------------------------------ 4. Forecast
    forecast_results = []
    for svc in services:
        history = fetch_cpu_history(svc, lookback_minutes=settings.metrics_lookback_minutes)
        fc = forecast_cpu(svc, history)
        if fc:
            forecast_results.append(fc)
            logger.debug(
                "Forecast [%s] trend=%s peak=%.4f", svc, fc.trend, fc.peak_cpu
            )

    # ------------------------------------------------------------------ 5. Persist
    for ar in anomaly_results:
        save_anomaly_result(ar)
    for rr in rca_results:
        save_rca_result(rr)
    for fr in forecast_results:
        save_forecast(fr)

    elapsed = time.perf_counter() - t_start
    logger.info(
        "Detection cycle complete in %.2fs — anomalies=%d rca=%d forecasts=%d",
        elapsed, len(anomalous_services), len(rca_results), len(forecast_results),
    )


def start_worker() -> None:
    settings = get_settings()
    interval = settings.detection_interval_seconds
    logger.info("AI Engine worker starting (interval=%ds)", interval)

    while True:
        try:
            run_detection_cycle()
        except Exception:
            logger.exception("Detection cycle raised an unhandled exception")
        time.sleep(interval)
