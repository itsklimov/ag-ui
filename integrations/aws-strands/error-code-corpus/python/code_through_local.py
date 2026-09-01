"""A code reached through a local binding rather than written at the site."""

from ag_ui.core import EventType, RunErrorEvent


def emit() -> RunErrorEvent:
    failure_code = "THROUGH_LOCAL"
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message="Resolved through a local.",
        code=failure_code,
    )
