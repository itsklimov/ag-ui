/** A classifier holding a code-shaped literal none of its returns produce. */
import { EventType, type BaseEvent } from "@ag-ui/core";

function classify(error: unknown): string {
  if (String(error) === "LEGACY_TIMEOUT") return "GUARDED_ADAPTER_BUG";
  return "GUARDED_STRANDS_ERROR";
}

export function emit(error: unknown): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "Resolved through a guarded classifier.",
    code: classify(error),
  };
}
