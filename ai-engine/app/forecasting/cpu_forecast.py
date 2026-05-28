import logging
from dataclasses import dataclass

import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import Pipeline

from app.config import get_settings
from app.ingestion.prometheus import MetricSample

logger = logging.getLogger(__name__)

_MIN_HISTORY_POINTS = 5


@dataclass
class ForecastResult:
    service: str
    predictions: list[float]        # predicted CPU rate values (future)
    prediction_timestamps: list[float]  # Unix timestamps for each prediction
    trend: str                      # "increasing" | "decreasing" | "stable"
    peak_cpu: float                 # max predicted value over the horizon
    confidence_note: str
    history_actual: list[float] | None = None
    history_fitted: list[float] | None = None
    history_timestamps: list[float] | None = None


def forecast_cpu(service: str, history: list[MetricSample]) -> ForecastResult | None:
    """
    Fit a polynomial regression on historical CPU samples and project forward.

    Returns None when there is insufficient history to make a prediction.
    """
    settings = get_settings()
    horizon_min = settings.forecast_horizon_minutes

    if len(history) < _MIN_HISTORY_POINTS:
        logger.debug(
            "Insufficient history for %s (%d points, need %d)",
            service, len(history), _MIN_HISTORY_POINTS,
        )
        return None

    ts = np.array([s.timestamp for s in history])
    values = np.array([s.value for s in history])

    # Normalise timestamps to minutes-from-start to keep numerics stable
    t0 = ts[0]
    t_minutes = (ts - t0) / 60.0

    model = Pipeline([
        ("poly", PolynomialFeatures(degree=2, include_bias=False)),
        ("lr", LinearRegression()),
    ])
    model.fit(t_minutes.reshape(-1, 1), values)

    last_t_min = t_minutes[-1]
    last_ts = ts[-1]
    step = 60.0  # one prediction per minute
    future_t_min = np.array([
        last_t_min + (i + 1) for i in range(horizon_min)
    ])
    future_ts = last_ts + np.arange(1, horizon_min + 1) * step

    predictions = model.predict(future_t_min.reshape(-1, 1))
    predictions = np.clip(predictions, 0.0, None)  # CPU rate can't be negative

    # Trend: compare average of first vs last third of forecast
    third = max(1, horizon_min // 3)
    first_avg = float(predictions[:third].mean())
    last_avg = float(predictions[-third:].mean())
    delta = last_avg - first_avg
    if abs(delta) < 0.01:
        trend = "stable"
    elif delta > 0:
        trend = "increasing"
    else:
        trend = "decreasing"

    peak = float(predictions.max())
    r2 = float(model.score(t_minutes.reshape(-1, 1), values))

    logger.debug(
        "Forecast [%s] trend=%s peak=%.4f R²=%.3f horizon=%dmin",
        service, trend, peak, r2, horizon_min,
    )

    # Polynomial fit evaluated over the historical window — this curve IS visibly
    # non-linear because it smooths noisy data, making the quadratic term apparent.
    history_fitted_vals = np.clip(model.predict(t_minutes.reshape(-1, 1)), 0.0, None)

    return ForecastResult(
        service=service,
        predictions=[round(float(v), 6) for v in predictions],
        prediction_timestamps=[float(t) for t in future_ts],
        trend=trend,
        peak_cpu=round(peak, 6),
        confidence_note=f"poly_degree=2 R²={r2:.3f} history_points={len(history)}",
        history_actual=[round(float(v), 6) for v in values],
        history_fitted=[round(float(v), 6) for v in history_fitted_vals],
        history_timestamps=[float(t) for t in ts],
    )
