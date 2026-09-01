"""A frame built through the helper that early-exit paths funnel into."""

from typing import Any

from ag_ui.core import EventType, RunErrorEvent, RunStartedEvent


def _error_events(input_data: Any, message: str, code: str) -> tuple[Any, Any]:
    return (
        RunStartedEvent(
            type=EventType.RUN_STARTED,
            thread_id=input_data.thread_id,
            run_id=input_data.run_id,
        ),
        RunErrorEvent(type=EventType.RUN_ERROR, message=message, code=code),
    )


def emit(input_data: Any) -> tuple[Any, Any]:
    return _error_events(input_data, "Built through the helper.", "HELPER_MARKER")
