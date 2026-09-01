"""An unpacked object that carries a code without being a terminal frame."""

CONTEXT = {"source": "tool"}


def summarise() -> dict:
    return {**CONTEXT, "code": "NOT_A_FRAME", "detail": "Not a terminal frame."}
