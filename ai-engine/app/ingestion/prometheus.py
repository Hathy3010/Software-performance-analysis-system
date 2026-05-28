import logging
import time
from dataclasses import dataclass, field

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, before_sleep_log

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class ServiceMetrics:
    service: str
    cpu_rate: float          # cores/s (rate over 5m)
    memory_mb: float         # resident memory in MB
    latency_p99_s: float     # p99 request latency in seconds
    error_rate: float        # fraction of 5xx responses (0.0–1.0)
    timestamp: float = field(default_factory=time.time)
 

@dataclass
class MetricSample:
    timestamp: float
    value: float


def _instant_query(client: httpx.Client, query: str) -> float | None:
    """Execute a Prometheus instant query and return the first scalar result."""
    try:
        resp = client.get("/api/v1/query", params={"query": query}, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("data", {}).get("result", [])
        if not results:
            return None
        value = results[0]["value"][1]
        parsed = float(value)
        return None if (parsed != parsed) else parsed  # NaN check
    except Exception:
        logger.debug("Prometheus instant query failed: %s", query, exc_info=True)
        return None


def _range_query(
    client: httpx.Client,
    query: str,
    lookback_minutes: int,
    step_seconds: int = 60,
) -> list[MetricSample]:
    """Execute a Prometheus range query and return a list of (timestamp, value) samples."""
    end = time.time()
    start = end - lookback_minutes * 60
    try:
        resp = client.get(
            "/api/v1/query_range",
            params={"query": query, "start": start, "end": end, "step": step_seconds},
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("data", {}).get("result", [])
        if not results:
            return []
        samples = []
        for ts, val in results[0]["values"]:
            try:
                v = float(val)
                if v == v:  # NaN check
                    samples.append(MetricSample(timestamp=float(ts), value=v))
            except (ValueError, TypeError):
                pass
        return samples
    except Exception:
        logger.debug("Prometheus range query failed: %s", query, exc_info=True)
        return []


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
)
def fetch_current_metrics(services: list[str]) -> list[ServiceMetrics]:
    """Fetch the latest CPU, memory, latency, and error rate for each service."""
    settings = get_settings()
    results: list[ServiceMetrics] = []

    with httpx.Client(base_url=settings.prometheus_url) as client:
        for svc in services:
            cpu = _instant_query(
                client, f'rate(process_cpu_seconds_total{{job="{svc}"}}[5m])'
            )
            mem_bytes = _instant_query(
                client, f'process_resident_memory_bytes{{job="{svc}"}}'
            )
            latency = _instant_query(
                client,
                f'histogram_quantile(0.99, sum by (le) '
                f'(rate(http_request_duration_seconds_bucket{{job="{svc}"}}[5m])))',
            )
            # Error rate: ratio of 5xx to total; falls back to 0 if metric absent
            err_num = _instant_query(
                client,
                f'sum(rate(http_requests_total{{job="{svc}",status=~"5.."}}[5m]))',
            )
            err_den = _instant_query(
                client, f'sum(rate(http_requests_total{{job="{svc}"}}[5m]))'
            )
            error_rate = 0.0
            if err_num is not None and err_den and err_den > 0:
                error_rate = min(1.0, err_num / err_den)

            results.append(
                ServiceMetrics(
                    service=svc,
                    cpu_rate=cpu or 0.0,
                    memory_mb=(mem_bytes or 0.0) / (1024 * 1024),
                    latency_p99_s=latency or 0.0,
                    error_rate=error_rate,
                )
            )
            logger.debug(
                "Metrics [%s] cpu=%.4f mem=%.1fMB lat_p99=%.3fs err=%.2f%%",
                svc, cpu or 0, (mem_bytes or 0) / 1e6,
                latency or 0, error_rate * 100,
            )

    return results


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
)
def fetch_cpu_history(service: str, lookback_minutes: int) -> list[MetricSample]:
    """Fetch per-minute CPU rate history for a service (used by forecasting)."""
    settings = get_settings()
    with httpx.Client(base_url=settings.prometheus_url) as client:
        return _range_query(
            client,
            f'rate(process_cpu_seconds_total{{job="{service}"}}[1m])',
            lookback_minutes=lookback_minutes,
            step_seconds=60,
        )
