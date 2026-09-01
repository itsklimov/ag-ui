"""A frame built inside a constructor, against a local that shadows the file."""

from ag_ui.core import EventType, RunErrorEvent

failure_code = "AT_FILE_SCOPE"


class Reporter:
    def __init__(self) -> None:
        failure_code = "IN_CONSTRUCTOR"
        self.frame = RunErrorEvent(
            type=EventType.RUN_ERROR,
            message="Built in a constructor.",
            code=failure_code,
        )
