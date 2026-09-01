/** A code reached through the arms of a conditional the classifier returns. */
import { EventType, type BaseEvent } from "@ag-ui/core";

function classify(error: unknown): string {
  return error instanceof TypeError
    ? "CONDITIONAL_ADAPTER_BUG"
    : "CONDITIONAL_STRANDS_ERROR";
}

export function emit(error: unknown): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "Resolved through a conditional.",
    code: classify(error),
  };
}
