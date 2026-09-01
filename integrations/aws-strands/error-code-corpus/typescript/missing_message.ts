/** A terminal frame that carries no message. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(): BaseEvent {
  return { type: EventType.RUN_ERROR, code: "NO_MESSAGE" };
}
