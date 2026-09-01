/** A message that takes one of two literal branches. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(detail: boolean): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: detail
      ? "The conditional true branch."
      : "The conditional false branch.",
    code: "MESSAGE_CONDITIONAL",
  };
}
