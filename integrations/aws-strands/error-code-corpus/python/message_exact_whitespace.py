"""A sentence whose own spacing and line break are what reach the wire."""

from ag_ui.core import EventType, RunErrorEvent


def emit() -> RunErrorEvent:
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message="Two  spaces, a\nline break, and a trailing space. ",
        code="MESSAGE_EXACT_WHITESPACE",
    )
