/** A code reached through a top-level classifier the site calls. */
import { EventType, type BaseEvent } from "@ag-ui/core";

function classify(error: unknown): string {
  if (error instanceof TypeError) return "CLASSIFIER_ADAPTER_BUG";
  return "CLASSIFIER_STRANDS_ERROR";
}

export function emit(error: unknown): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "Resolved through a classifier.",
    code: classify(error),
  };
}
