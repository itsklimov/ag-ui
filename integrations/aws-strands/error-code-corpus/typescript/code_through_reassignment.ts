/** A code the site reaches only through a later reassignment. */
import { EventType, type BaseEvent } from "@ag-ui/core";

function deriveCode(kind: string): string {
  return kind.toUpperCase();
}

export function emit(kind: string): BaseEvent {
  let failureCode = deriveCode(kind);
  failureCode = "THROUGH_REASSIGNMENT";
  return {
    type: EventType.RUN_ERROR,
    message: "Resolved through a reassignment.",
    code: failureCode,
  };
}
