"""A frame built by unpacking a base frame and overriding its fields."""

from ag_ui.core import EventType, RunErrorEvent

ERROR_BASE = RunErrorEvent(
    type=EventType.RUN_ERROR,
    message="Base message.",
    code="SPREAD_BASE",
)


def emit() -> RunErrorEvent:
    return RunErrorEvent(
        **ERROR_BASE.model_dump(exclude={"message", "code"}),
        message="A spread-built message.",
        code="SPREAD_FRAME",
    )
