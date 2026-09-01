"""A code reached through a module-level classifier the site calls."""

from ag_ui.core import EventType, RunErrorEvent


def classify(error: Exception) -> str:
    if isinstance(error, KeyError):
        return "CLASSIFIER_ADAPTER_BUG"
    return "CLASSIFIER_STRANDS_ERROR"


def emit(error: Exception) -> RunErrorEvent:
    return RunErrorEvent(
        type=EventType.RUN_ERROR,
        message="Resolved through a classifier.",
        code=classify(error),
    )
