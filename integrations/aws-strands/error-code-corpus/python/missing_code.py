"""A terminal frame that names no code at all."""

from ag_ui.core import EventType, RunErrorEvent


def emit() -> RunErrorEvent:
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message="A frame with no code.",
    )
