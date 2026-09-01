/** A message falling back to a literal when the computed one is nullish. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(detail: string | undefined): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: detail ?? "The nullish fallback.",
    code: "MESSAGE_NULLISH_COALESCING",
  };
}
