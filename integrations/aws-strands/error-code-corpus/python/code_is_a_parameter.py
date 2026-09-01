"""A frame whose code arrives as a parameter and cannot be read statically."""

from ag_ui.core import EventType, RunErrorEvent


def emit(code: str) -> RunErrorEvent:
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message="A code that arrives as a parameter.",
        code=code,
    )
