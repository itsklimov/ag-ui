"""A frame whose fields are validated out of a mapping written at the site."""

from ag_ui.core import EventType, RunErrorEvent


def emit(detail: str) -> RunErrorEvent:
    return RunErrorEvent.model_validate(
        {
            "type": EventType.RUN_ERROR,
            "message": f"Validated from a mapping: {detail}",
            "code": "CONSTRUCTOR_FROM_A_MAPPING",
        }
    )
