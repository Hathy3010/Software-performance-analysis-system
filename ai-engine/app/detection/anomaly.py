import logging
from collections import deque
from dataclasses import dataclass
from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest

from app.config import get_settings
from app.ingestion.prometheus import ServiceMetrics

logger = logging.getLogger(__name__)

_BUFFER_SIZE = 120   # keep 120 one-minute samples per service (~2 hours)
_SPIKE_Z_THRESHOLD = 3.0


@dataclass
class AnomalyResult:
    service: str
    anomaly_score: float    # 0.0 = normal → 1.0 = highly anomalous
    is_anomaly: bool
    spike_detected: bool
    features: dict[str, Any]  # raw feature values used for scoring
    method: str             # "isolation_forest" | "threshold_fallback"
    detail: str


class AnomalyDetector:
    """
    Per-service Isolation Forest with a rolling sample buffer.

    Feature vector: [cpu_rate, memory_mb, latency_p99_s, error_rate]

    Falls back to simple threshold scoring until MIN_SAMPLES are collected.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._threshold = settings.anomaly_score_threshold
        self._min_samples = settings.min_isolation_forest_samples
        self._buffers: dict[str, deque[np.ndarray]] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def score(self, metrics: ServiceMetrics) -> AnomalyResult:
        features = np.array([
            metrics.cpu_rate,
            metrics.memory_mb,
            metrics.latency_p99_s,
            metrics.error_rate,
        ], dtype=float)

        buf = self._buffer_for(metrics.service)
        buf.append(features.copy())

        spike = self._detect_spike(buf, features)

        if len(buf) < self._min_samples:
            return self._threshold_fallback(metrics, features, spike, len(buf))

        return self._isolation_forest_score(metrics.service, features, spike, buf)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _buffer_for(self, service: str) -> deque[np.ndarray]:
        if service not in self._buffers:
            self._buffers[service] = deque(maxlen=_BUFFER_SIZE)
        return self._buffers[service]

    def _detect_spike(self, buf: deque[np.ndarray], current: np.ndarray) -> bool:
        if len(buf) < 10:
            return False
        history = np.array(list(buf)[:-1])   # exclude the point just appended
        mean = history.mean(axis=0)
        std = history.std(axis=0) + 1e-9
        z = np.abs((current - mean) / std)
        return bool(np.any(z > _SPIKE_Z_THRESHOLD))

    def _isolation_forest_score(
        self,
        service: str,
        features: np.ndarray,
        spike: bool,
        buf: deque[np.ndarray],
    ) -> AnomalyResult:
        X = np.array(list(buf))
        clf = IsolationForest(
            n_estimators=100,
            contamination=0.05,
            random_state=42,
            n_jobs=1,
        )
        clf.fit(X)

        # decision_function: negative → anomalous, positive → normal
        # Map to [0, 1]: score = clip(0.5 - decision_function, 0, 1)
        raw = float(clf.decision_function(features.reshape(1, -1))[0])
        score = float(np.clip(0.5 - raw, 0.0, 1.0))

        is_anomaly = score > self._threshold or spike
        logger.debug(
            "IF score [%s] raw=%.4f norm=%.4f spike=%s anomaly=%s",
            service, raw, score, spike, is_anomaly,
        )
        return AnomalyResult(
            service=service,
            anomaly_score=round(score, 4),
            is_anomaly=is_anomaly,
            spike_detected=spike,
            features=self._feature_dict(features),
            method="isolation_forest",
            detail=f"n_samples={len(buf)}, raw_score={raw:.4f}",
        )

    def _threshold_fallback(
        self,
        metrics: ServiceMetrics,
        features: np.ndarray,
        spike: bool,
        n: int,
    ) -> AnomalyResult:
        score = 0.0
        if metrics.cpu_rate > 0.8:
            score += 0.4
        elif metrics.cpu_rate > 0.5:
            score += 0.2
        if metrics.latency_p99_s > 1.0:
            score += 0.4
        elif metrics.latency_p99_s > 0.3:
            score += 0.2
        if metrics.error_rate > 0.10:
            score += 0.3
        elif metrics.error_rate > 0.05:
            score += 0.1
        score = min(score, 1.0)

        is_anomaly = score > self._threshold or spike
        return AnomalyResult(
            service=metrics.service,
            anomaly_score=round(score, 4),
            is_anomaly=is_anomaly,
            spike_detected=spike,
            features=self._feature_dict(features),
            method="threshold_fallback",
            detail=f"warming_up n={n}/{self._min_samples}",
        )

    @staticmethod
    def _feature_dict(features: np.ndarray) -> dict[str, float]:
        return {
            "cpu_rate": round(float(features[0]), 6),
            "memory_mb": round(float(features[1]), 2),
            "latency_p99_s": round(float(features[2]), 6),
            "error_rate": round(float(features[3]), 6),
        }
