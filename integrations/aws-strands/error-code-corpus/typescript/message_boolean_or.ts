/** A message falling back to a literal when the computed one is empty. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(detail: string): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: detail || "The boolean fallback.",
    code: "MESSAGE_BOOLEAN_OR",
  };
}
