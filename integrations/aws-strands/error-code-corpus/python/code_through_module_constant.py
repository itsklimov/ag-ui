"""A code reached through a module-level constant."""

from ag_ui.core import EventType, RunErrorEvent

MODULE_CODE = "THROUGH_MODULE_CONSTANT"


def emit() -> RunErrorEvent:
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message="Resolved through a module constant.",
        code=MODULE_CODE,
    )
