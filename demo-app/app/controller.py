import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Optional


@dataclass
class ScenarioEffect:
    """Live effect applied to every request — scenarios mutate this in-place."""
    order_extra_latency: float = 0.0      # seconds added to /api/orders
    payment_extra_latency: float = 0.0    # seconds added to /api/payments
    order_error_prob: float = 0.0         # probability (0–1) of HTTP error on orders
    payment_error_prob: float = 0.0       # probability (0–1) of HTTP error on payments
    order_error_code: int = 500
    payment_error_code: int = 503
    cpu_burn_seconds: float = 0.0         # real CPU burn per request (busy loop)


@dataclass
class ActiveScenario:
    name: str
    description: str
    started_at: datetime
    task: asyncio.Task
    effect: ScenarioEffect = field(default_factory=ScenarioEffect)
    phase: int = 0
    phase_label: str = "starting"
    _memory_bloat: list = field(default_factory=list, repr=False)


class DemoController:
    _inst: Optional["DemoController"] = None

    def __init__(self) -> None:
        self._active: Optional[ActiveScenario] = None
        self._lock = asyncio.Lock()

    @classmethod
    def get(cls) -> "DemoController":
        if cls._inst is None:
            cls._inst = cls()
        return cls._inst

    @property
    def active(self) -> Optional[ActiveScenario]:
        return self._active

    async def start(self, name: str, description: str, fn: Callable) -> ActiveScenario:
        async with self._lock:
            await self._cancel_current()
            s = ActiveScenario(
                name=name,
                description=description,
                started_at=datetime.now(timezone.utc),
                task=asyncio.create_task(self._wrap(fn), name=f"scenario-{name}"),
            )
            self._active = s
            return s

    async def _wrap(self, fn: Callable) -> None:
        s = self._active
        try:
            await fn(s)
        except asyncio.CancelledError:
            pass
        finally:
            if s is not None:
                s._memory_bloat.clear()

    async def stop(self) -> Optional[str]:
        async with self._lock:
            return await self._cancel_current()

    async def _cancel_current(self) -> Optional[str]:
        if self._active is None:
            return None
        name = self._active.name
        self._active.task.cancel()
        await asyncio.sleep(0)
        self._active = None
        return name

    def status(self) -> dict:
        if not self._active:
            return {"active": False, "scenario": None}
        s = self._active
        e = s.effect
        return {
            "active": True,
            "scenario": s.name,
            "description": s.description,
            "started_at": s.started_at.isoformat(),
            "phase": s.phase,
            "phase_label": s.phase_label,
            "effects": {
                "order_extra_latency_s": round(e.order_extra_latency, 3),
                "payment_extra_latency_s": round(e.payment_extra_latency, 3),
                "order_error_prob": round(e.order_error_prob, 3),
                "payment_error_prob": round(e.payment_error_prob, 3),
                "cpu_burn_s": round(e.cpu_burn_seconds, 3),
            },
        }
