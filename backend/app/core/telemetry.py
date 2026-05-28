import logging
import os
import time

from fastapi import FastAPI, Request
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

logger = logging.getLogger(__name__)


class TraceContextLogFilter(logging.Filter):
    """Injects trace_id and span_id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        span = trace.get_current_span()
        ctx = span.get_span_context() if span else None
        if ctx and ctx.is_valid:
            record.trace_id = format(ctx.trace_id, "032x")
            record.span_id = format(ctx.span_id, "016x")
        else:
            record.trace_id = "-"
            record.span_id = "-"
        return True


def _install_log_filter() -> None:
    root = logging.getLogger()
    root.addFilter(TraceContextLogFilter())
    for handler in root.handlers:
        if hasattr(handler, "formatter") and handler.formatter:
            fmt = handler.formatter._fmt if hasattr(handler.formatter, "_fmt") else ""
            if "trace_id" not in fmt:
                handler.setFormatter(
                    logging.Formatter(
                        "%(asctime)s %(levelname)s [%(trace_id)s/%(span_id)s] %(name)s: %(message)s"
                    )
                )


def init_telemetry() -> None:
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4317")
    service_name = os.getenv("OTEL_SERVICE_NAME", "backend")

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=True))
    )
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor().instrument()
    SQLAlchemyInstrumentor().instrument()

    _install_log_filter()
    logger.info("Telemetry initialized (service=%s endpoint=%s)", service_name, endpoint)


def add_business_span_middleware(app: FastAPI) -> None:
    """
    Middleware that attaches business-level attributes to the active OTel span
    for every request: user role, endpoint name, response status, latency.
    Call this after init_telemetry().
    """

    async def _attach_business_attrs(request: Request, call_next):
        t0 = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)

        span = trace.get_current_span()
        if span and span.is_recording():
            user = getattr(request.state, "user", None)
            if user:
                span.set_attribute("app.user.role", getattr(user, "role", "unknown"))
                span.set_attribute("app.user.id", str(getattr(user, "id", "")))

            span.set_attribute("app.response.status_code", response.status_code)
            span.set_attribute("app.response.latency_ms", elapsed_ms)
            span.set_attribute("app.endpoint", request.url.path)

            if response.status_code >= 500:
                span.set_attribute("error", True)

        return response

    app.middleware("http")(_attach_business_attrs)
