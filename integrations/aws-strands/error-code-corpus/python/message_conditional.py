"""A message that takes one of two literal branches."""

from ag_ui.core import EventType, RunErrorEvent


def emit(detail: bool) -> RunErrorEvent:
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message=(
            "The conditional true branch."
            if detail
            else "The conditional false branch."
        ),
        code="MESSAGE_CONDITIONAL",
    )
