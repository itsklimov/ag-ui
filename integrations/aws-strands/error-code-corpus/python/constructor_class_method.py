"""A frame built through one of the constructor's own class methods."""

from ag_ui.core import EventType, RunErrorEvent


def emit(detail: str) -> RunErrorEvent:
    return RunErrorEvent.model_construct(
        type=EventType.RUN_ERROR,
        message=f"Built through a class method: {detail}",
        code="CONSTRUCTOR_CLASS_METHOD",
    )
