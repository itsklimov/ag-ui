/** A terminal frame whose code and message are both written at the site. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "A plain literal message.",
    code: "PLAIN_LITERAL",
  };
}
