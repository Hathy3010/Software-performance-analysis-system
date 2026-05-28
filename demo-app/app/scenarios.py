"""
Demo scenario coroutines.

Each scenario:
  1. Sets effect parameters (latency, error probabilities) on the ActiveScenario
  2. Runs a continuous traffic loop against its own endpoints so Prometheus captures real metrics

Without self-generated traffic, Prometheus has no samples → AI engine sees nothing change.
Traffic is sent to localhost:8080 from within the container using httpx.

AI engine feature vector: [cpu_rate, memory_mb, latency_p99_s, error_rate]

Threshold fallback scoring (first 20 samples):
  latency > 1.0s   → +0.40   latency > 0.3s → +0.20
  error_rate > 10% → +0.30   error_rate > 5% → +0.10
  cpu_rate > 0.8   → +0.40   cpu_rate > 0.5  → +0.20
"""

import asyncio
import logging
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from app.controller import ActiveScenario

logger = logging.getLogger(__name__)

_BASE = "http://localhost:8080"
_PATH_ORDERS = "/api/orders"
_PATH_PAYMENTS = "/api/payments"


async def _traffic(concurrency: int, interval: float = 0.5) -> None:
    """
    Fire concurrency requests per interval against orders + payments.
    Runs until cancelled. Errors are expected and intentionally swallowed —
    they show up as 5xx in Prometheus, which is exactly what we want.
    """
    async with httpx.AsyncClient(base_url=_BASE, timeout=10.0) as client:
        while True:
            tasks = []
            for _ in range(concurrency):
                tasks.append(client.get(_PATH_ORDERS))
                tasks.append(client.get(_PATH_PAYMENTS))
                tasks.append(client.post(_PATH_ORDERS))
            results = await asyncio.gather(*tasks, return_exceptions=True)
            ok = sum(1 for r in results if isinstance(r, httpx.Response))
            err = len(results) - ok
            logger.debug("traffic tick: %d ok  %d err/timeout", ok, err)
            await asyncio.sleep(interval)


def _reset(s: "ActiveScenario") -> None:
    from app.controller import ScenarioEffect
    s.effect = ScenarioEffect()


# ---------------------------------------------------------------------------
# 1. Basic Anomaly
#    Drives: latency_p99_s → ~0.4s
#    Score:  ~0.20–0.35
# ---------------------------------------------------------------------------

async def demo_basic_anomaly(s: "ActiveScenario") -> None:
    s.phase, s.phase_label = 1, "minor_latency"
    s.effect.order_extra_latency = 0.40
    await asyncio.gather(
        _traffic(concurrency=3, interval=0.5),
        _keepalive(),
    )


# ---------------------------------------------------------------------------
# 2. Performance Issue
#    Drives: latency_p99_s → ~0.8s  +  cpu_rate spike  +  memory growth
#    Score:  ~0.55–0.70
# ---------------------------------------------------------------------------

async def demo_performance_issue(s: "ActiveScenario") -> None:
    s.phase, s.phase_label = 1, "cpu_and_latency"
    s.effect.order_extra_latency = 0.70
    s.effect.payment_extra_latency = 0.50
    s.effect.cpu_burn_seconds = 0.15

    async def _escalate():
        await asyncio.sleep(10)
        s.phase_label = "cpu_latency_memory_leak"
        s._memory_bloat = [bytearray(1024 * 1024) for _ in range(30)]

    await asyncio.gather(
        _traffic(concurrency=4, interval=0.4),
        _escalate(),
    )


# ---------------------------------------------------------------------------
# 3. Error Spike
#    Drives: error_rate → ~35–40%
#    Score:  ~0.40–0.55
# ---------------------------------------------------------------------------

async def demo_error_spike(s: "ActiveScenario") -> None:
    s.phase, s.phase_label = 1, "high_error_rate"
    s.effect.order_error_prob = 0.40
    s.effect.order_error_code = 500
    s.effect.payment_error_prob = 0.30
    s.effect.payment_error_code = 500
    await _traffic(concurrency=5, interval=0.4)


# ---------------------------------------------------------------------------
# 4. Intermittent Failure
#    Drives: latency + errors oscillate on/off every 15s
#    Score:  toggles ~0.20 ↔ ~0.65
# ---------------------------------------------------------------------------

async def demo_intermittent_failure(s: "ActiveScenario") -> None:
    async def _toggle():
        while True:
            s.phase, s.phase_label = 1, "degraded"
            s.effect.order_extra_latency = 1.20
            s.effect.order_error_prob = 0.20
            s.effect.payment_extra_latency = 0.80
            await asyncio.sleep(15)

            s.phase, s.phase_label = 2, "recovered"
            s.effect.order_extra_latency = 0.0
            s.effect.order_error_prob = 0.0
            s.effect.payment_extra_latency = 0.0
            await asyncio.sleep(15)

    await asyncio.gather(
        _traffic(concurrency=4, interval=0.5),
        _toggle(),
    )


# ---------------------------------------------------------------------------
# 5. Dependency Failure
#    Drives: payment_latency → 2.5s + 85% 503, orders cascade → 35% 502
#    Score:  ~0.75–0.85
# ---------------------------------------------------------------------------

async def demo_dependency_failure(s: "ActiveScenario") -> None:
    s.phase, s.phase_label = 1, "payment_service_unreachable"
    s.effect.payment_extra_latency = 2.50
    s.effect.payment_error_prob = 0.85
    s.effect.payment_error_code = 503
    s.effect.order_error_prob = 0.35
    s.effect.order_error_code = 502
    await _traffic(concurrency=3, interval=0.6)


# ---------------------------------------------------------------------------
# 6. Cascading Failure
#    Phase 1 (0–30s):  DB slow           latency 0.5s
#    Phase 2 (30–60s): Timeouts begin    latency 1.5s, 25% errors
#    Phase 3 (60s+):   Full cascade      latency 2.5s, 65% errors, CPU spike
#    Score rises:  ~0.25 → ~0.60 → ~0.90
# ---------------------------------------------------------------------------

async def demo_cascading_failure(s: "ActiveScenario") -> None:
    async def _phases():
        s.phase, s.phase_label = 1, "db_slow"
        s.effect.order_extra_latency = 0.50
        s.effect.payment_extra_latency = 0.30
        await asyncio.sleep(30)

        s.phase, s.phase_label = 2, "timeouts_starting"
        s.effect.order_extra_latency = 1.50
        s.effect.payment_extra_latency = 1.00
        s.effect.order_error_prob = 0.25
        s.effect.payment_error_prob = 0.20
        await asyncio.sleep(30)

        s.phase, s.phase_label = 3, "full_cascade"
        s.effect.order_extra_latency = 2.50
        s.effect.payment_extra_latency = 3.00
        s.effect.order_error_prob = 0.65
        s.effect.payment_error_prob = 0.80
        s.effect.cpu_burn_seconds = 0.10
        while True:
            await asyncio.sleep(5)

    await asyncio.gather(
        _traffic(concurrency=4, interval=0.5),
        _phases(),
    )


# ---------------------------------------------------------------------------
# 7. WOW — RCA Demo
#    Root cause: payment DB connection pool exhaustion
#
#    Phase 1 (0–20s):   payment barely slow (root cause, subtle)
#    Phase 2 (20–45s):  orders cascade (propagation visible in traces)
#    Phase 3 (45–75s):  full impact (anomaly_score > 0.90)
#    Phase 4 (75–95s):  auto-recovery (fix deployed)
#    Phase 5 (95s+):    recovered (normal operation)
# ---------------------------------------------------------------------------

async def demo_wow_rca(s: "ActiveScenario") -> None:
    async def _phases():
        # Phase 1: root cause starts — payment DB contention (subtle)
        s.phase, s.phase_label = 1, "payment_db_degrading"
        s.effect.payment_extra_latency = 0.60
        s.effect.payment_error_prob = 0.05
        await asyncio.sleep(20)

        # Phase 2: cascade — orders affected by payment timeout
        s.phase, s.phase_label = 2, "order_cascade_begins"
        s.effect.payment_extra_latency = 1.80
        s.effect.payment_error_prob = 0.40
        s.effect.order_extra_latency = 1.20
        s.effect.order_error_prob = 0.25
        await asyncio.sleep(25)

        # Phase 3: full impact
        s.phase, s.phase_label = 3, "full_impact"
        s.effect.payment_extra_latency = 3.00
        s.effect.payment_error_prob = 0.90
        s.effect.order_extra_latency = 2.50
        s.effect.order_error_prob = 0.70
        s.effect.cpu_burn_seconds = 0.12
        await asyncio.sleep(30)

        # Phase 4: recovery
        s.phase, s.phase_label = 4, "recovering"
        s.effect.payment_extra_latency = 0.40
        s.effect.payment_error_prob = 0.05
        s.effect.order_extra_latency = 0.20
        s.effect.order_error_prob = 0.02
        s.effect.cpu_burn_seconds = 0.0
        await asyncio.sleep(20)

        # Phase 5: recovered
        s.phase, s.phase_label = 5, "recovered"
        _reset(s)

    await asyncio.gather(
        _traffic(concurrency=5, interval=0.4),
        _phases(),
    )


# ---------------------------------------------------------------------------
# 8. Memory Leak
#    Simulates a gradual memory leak — allocates ~20 MB every 10s
#    Memory grows:  0 MB → 20 MB → 40 MB → ... → 200 MB
#    Score rises:   ~0.10 → ~0.45 → ~0.75 (memory_mb feature)
# ---------------------------------------------------------------------------

async def demo_memory_leak(s: "ActiveScenario") -> None:
    async def _leak():
        chunk_mb = 20
        s.phase, s.phase_label = 1, "leak_starting"
        while True:
            s._memory_bloat.append(bytearray(chunk_mb * 1024 * 1024))
            total_mb = len(s._memory_bloat) * chunk_mb
            if total_mb < 80:
                s.phase, s.phase_label = 1, f"leak_{total_mb}mb"
            elif total_mb < 160:
                s.phase, s.phase_label = 2, f"leak_{total_mb}mb_warn"
                s.effect.order_extra_latency = 0.20
            else:
                s.phase, s.phase_label = 3, f"leak_{total_mb}mb_critical"
                s.effect.order_extra_latency = 0.50
                s.effect.payment_extra_latency = 0.30
            await asyncio.sleep(10)

    await asyncio.gather(
        _traffic(concurrency=2, interval=0.8),
        _leak(),
    )


# ---------------------------------------------------------------------------
# 9. High CPU Spike
#    Pure CPU saturation — no added latency, just heavy compute per request
#    Phase 1 (0–20s):  moderate burn 200ms/req
#    Phase 2 (20–45s): heavy burn   400ms/req
#    Phase 3 (45s+):   extreme burn 600ms/req + 15% error rate
#    Score:  ~0.30 → ~0.65 → ~0.90 (cpu_rate feature dominates)
# ---------------------------------------------------------------------------

async def demo_high_cpu_spike(s: "ActiveScenario") -> None:
    async def _phases():
        s.phase, s.phase_label = 1, "cpu_moderate"
        s.effect.cpu_burn_seconds = 0.20
        await asyncio.sleep(20)

        s.phase, s.phase_label = 2, "cpu_heavy"
        s.effect.cpu_burn_seconds = 0.40
        await asyncio.sleep(25)

        s.phase, s.phase_label = 3, "cpu_extreme"
        s.effect.cpu_burn_seconds = 0.60
        s.effect.order_error_prob = 0.15
        s.effect.order_error_code = 503
        await asyncio.Event().wait()

    await asyncio.gather(
        _traffic(concurrency=6, interval=0.3),
        _phases(),
    )


def _surge_concurrency(phase: int) -> int:
    """Map surge scenario phase → request concurrency."""
    if phase == 2:
        return 15
    if phase == 3:
        return 25
    if phase == 4:
        return 8
    return 2


# ---------------------------------------------------------------------------
# 10. Traffic Surge
#    Simulates a sudden 10x traffic spike (flash sale / viral event)
#    Phase 1 (0–15s):  baseline traffic    (concurrency 2)
#    Phase 2 (15–45s): surge begins        (concurrency 15, latency +0.3s)
#    Phase 3 (45–75s): peak overload       (concurrency 25, latency +1.5s, 20% errors)
#    Phase 4 (75s+):   gradual drain       (concurrency 8, latency recovering)
#    Score:  ~0.10 → ~0.40 → ~0.85 → ~0.30
# ---------------------------------------------------------------------------

async def demo_traffic_surge(s: "ActiveScenario") -> None:
    _stop = asyncio.Event()

    async def _surge_traffic():
        async with httpx.AsyncClient(base_url=_BASE, timeout=10.0) as client:
            while True:
                ctrl = DemoController.get().active
                concurrency = _surge_concurrency(ctrl.phase) if ctrl else 2
                tasks = (
                    [client.get(_PATH_ORDERS)] * concurrency
                    + [client.get(_PATH_PAYMENTS)] * (concurrency // 2)
                )
                await asyncio.gather(*tasks, return_exceptions=True)
                try:
                    await asyncio.wait_for(_stop.wait(), timeout=0.2)
                    break
                except asyncio.TimeoutError:
                    pass

    async def _phases():
        s.phase, s.phase_label = 1, "baseline"
        await asyncio.sleep(15)

        s.phase, s.phase_label = 2, "surge_starting"
        s.effect.order_extra_latency = 0.30
        s.effect.payment_extra_latency = 0.20
        await asyncio.sleep(30)

        s.phase, s.phase_label = 3, "peak_overload"
        s.effect.order_extra_latency = 1.50
        s.effect.payment_extra_latency = 1.00
        s.effect.order_error_prob = 0.20
        s.effect.order_error_code = 429
        s.effect.payment_error_prob = 0.15
        s.effect.payment_error_code = 429
        await asyncio.sleep(30)

        s.phase, s.phase_label = 4, "draining"
        s.effect.order_extra_latency = 0.40
        s.effect.payment_extra_latency = 0.20
        s.effect.order_error_prob = 0.05
        s.effect.payment_error_prob = 0.0
        await asyncio.Event().wait()

    try:
        await asyncio.gather(_surge_traffic(), _phases())
    finally:
        _stop.set()


async def _keepalive() -> None:
    """Used by scenarios that don't have a phase loop — keeps them alive until cancelled."""
    await asyncio.Event().wait()


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

SCENARIO_REGISTRY: dict[str, tuple[str, callable]] = {
    "basic_anomaly": (
        "Latency +400ms on orders. Subtle — crosses IsolationForest Z-spike threshold.",
        demo_basic_anomaly,
    ),
    "performance_issue": (
        "CPU burn 150ms/req + latency 700ms + 30MB memory growth after 10s.",
        demo_performance_issue,
    ),
    "error_spike": (
        "40% orders → HTTP 500, 30% payments → HTTP 500. error_rate spikes hard.",
        demo_error_spike,
    ),
    "intermittent_failure": (
        "15s degraded (latency 1.2s + 20% errors) / 15s healthy — oscillating pattern.",
        demo_intermittent_failure,
    ),
    "dependency_failure": (
        "Payment service 503 + 2.5s timeout (85%). Orders cascade to 502 (35%).",
        demo_dependency_failure,
    ),
    "cascading_failure": (
        "3 phases: db_slow (0-30s) → timeouts (30-60s) → full cascade (60s+). Score 0.25→0.90.",
        demo_cascading_failure,
    ),
    "wow_rca": (
        "4-phase RCA chain: payment DB → order cascade → full impact → auto-recovery. "
        "Payment errors precede order errors by 20s — clear causal direction in traces.",
        demo_wow_rca,
    ),
    "memory_leak": (
        "Gradual memory leak +20 MB every 10s. Latency rises at 80 MB, errors at 160 MB. "
        "Score climbs slowly: 0.10 → 0.45 → 0.75 as memory_mb feature dominates.",
        demo_memory_leak,
    ),
    "high_cpu_spike": (
        "3-phase CPU saturation: 200ms → 400ms → 600ms burn per request. "
        "No added I/O latency — pure compute load. Score 0.30 → 0.65 → 0.90.",
        demo_high_cpu_spike,
    ),
    "traffic_surge": (
        "Flash-sale traffic surge: baseline → 15x → 25x concurrency → drain. "
        "Triggers 429 rate-limit errors at peak. Score 0.10 → 0.40 → 0.85 → 0.30.",
        demo_traffic_surge,
    ),
}
