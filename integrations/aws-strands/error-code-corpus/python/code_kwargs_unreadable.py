"""A frame whose fields arrive as a mapping the extractor cannot read."""

from ag_ui.core import RunErrorEvent


def emit(payload: dict) -> RunErrorEvent:
    return RunErrorEvent(**payload)
