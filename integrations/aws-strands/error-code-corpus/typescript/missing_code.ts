/** A terminal frame that names no code at all. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "A frame with no code.",
  };
}
