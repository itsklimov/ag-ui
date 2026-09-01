/** A terminal frame whose type is written inside parentheses. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(): BaseEvent {
  return {
    type: (EventType.RUN_ERROR),
    message: "Typed inside parentheses.",
    code: "TYPE_PARENTHESISED",
  };
}
