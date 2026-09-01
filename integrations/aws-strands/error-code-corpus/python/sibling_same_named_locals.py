"""Two sibling branches binding the same local name to different codes."""

from ag_ui.core import EventType, RunErrorEvent


def emit(kind: str) -> RunErrorEvent | None:
    if kind == "first":
        failure_code = "FIRST_SIBLING"
        return RunErrorEvent(
            type=EventType.RUN_ERROR,
            message="The first sibling.",
            code=failure_code,
        )
    if kind == "second":
        failure_code = "SECOND_SIBLING"
        return RunErrorEvent(
            type=EventType.RUN_ERROR,
            message="The second sibling.",
            code=failure_code,
        )
    return None
