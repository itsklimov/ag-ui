"""The construction marker reached through a local alias of the constructor."""

from ag_ui.core import EventType, RunErrorEvent

ErrorFrame = RunErrorEvent


def emit() -> RunErrorEvent:
    return ErrorFrame(
        type=EventType.RUN_ERROR,
        message="An aliased constructor message.",
        code="ALIASED_CONSTRUCTOR",
    )
