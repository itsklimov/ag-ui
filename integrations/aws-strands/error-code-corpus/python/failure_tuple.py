"""A code and message bound as a tuple before the frame is written."""

from ag_ui.core import EventType, RunErrorEvent


def emit(encoding_failed: bool) -> RunErrorEvent:
    failure = ("FAILURE_TUPLE", "Bound as a failure tuple.")
    if encoding_failed:
        failure = ("FAILURE_TUPLE_ENCODING", "Encoding failed.")
    code, message = failure
    return RunErrorEvent(type=EventType.RUN_ERROR, message=message, code=code)
