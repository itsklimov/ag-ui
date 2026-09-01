"""A code the site reaches only through a later reassignment."""

from ag_ui.core import EventType, RunErrorEvent


def derive_code(kind: str) -> str:
    return kind.upper()


def emit(kind: str) -> RunErrorEvent:
    failure_code = derive_code(kind)
    failure_code = "THROUGH_REASSIGNMENT"
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message="Resolved through a reassignment.",
        code=failure_code,
    )
