"""A message falling back to a literal when the computed one is empty."""

from ag_ui.core import EventType, RunErrorEvent


def emit(detail: str) -> RunErrorEvent:
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message=detail or "The boolean fallback.",
        code="MESSAGE_BOOLEAN_OR",
    )
