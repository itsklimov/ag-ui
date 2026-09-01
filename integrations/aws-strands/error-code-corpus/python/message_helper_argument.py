"""Sentences that reach the wire as arguments to a single-purpose builder."""

from ag_ui.core import EventType, RunErrorEvent


def resume_error(message: str) -> RunErrorEvent:
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message=message,
        code="HELPER_ARGUMENT",
    )


def emit(interrupt_id: str) -> RunErrorEvent:
    if not interrupt_id:
        return resume_error("The helper argument sentence.")
    return resume_error(f"Interrupt {interrupt_id} is unknown.")
