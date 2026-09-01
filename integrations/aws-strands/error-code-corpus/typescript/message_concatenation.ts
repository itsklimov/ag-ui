/** A message built by concatenating literals around an interpolated value. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(detail: string): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "Concatenated " + detail + " tail.",
    code: "MESSAGE_CONCATENATION",
  };
}
