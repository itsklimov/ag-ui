"""A frame built inside a property accessor."""

from ag_ui.core import EventType, RunErrorEvent

failure_code = "AT_FILE_SCOPE"


class Reporter:
    @property
    def failure(self) -> RunErrorEvent:
        failure_code = "IN_ACCESSOR"
        return RunErrorEvent(
            type=EventType.RUN_ERROR,
            message="Built in an accessor.",
            code=failure_code,
        )
