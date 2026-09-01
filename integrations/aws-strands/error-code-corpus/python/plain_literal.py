"""A terminal frame whose code and message are both written at the site."""

from ag_ui.core import EventType, RunErrorEvent


def emit() -> RunErrorEvent:
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message="A plain literal message.",
        code="PLAIN_LITERAL",
    )
