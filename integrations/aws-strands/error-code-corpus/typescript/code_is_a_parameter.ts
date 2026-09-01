/** A frame whose code arrives as a parameter and cannot be read statically. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(code: string): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "A code that arrives as a parameter.",
    code,
  };
}
