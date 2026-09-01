/** A terminal frame whose type arrives as an identifier from outside. */
import { type BaseEvent } from "@ag-ui/core";

export function emit(eventType: string): BaseEvent {
  return {
    type: eventType,
    message: "Typed through an unresolved identifier.",
    code: "TYPE_UNRESOLVED_IDENTIFIER",
  } as unknown as BaseEvent;
}
