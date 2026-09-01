/** A code reached through a local binding rather than written at the site. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(): BaseEvent {
  const failureCode = "THROUGH_LOCAL";
  return {
    type: EventType.RUN_ERROR,
    message: "Resolved through a local.",
    code: failureCode,
  };
}
