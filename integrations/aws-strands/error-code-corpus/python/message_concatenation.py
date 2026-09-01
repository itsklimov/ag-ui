"""A message built by concatenating literals around an interpolated value."""

from ag_ui.core import EventType, RunErrorEvent


def emit(detail: str) -> RunErrorEvent:
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message="Concatenated " + detail + " tail.",
        code="MESSAGE_CONCATENATION",
    )
