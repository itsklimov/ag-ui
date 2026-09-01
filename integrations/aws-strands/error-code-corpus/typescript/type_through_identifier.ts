/** A terminal frame whose type arrives through an identifier bound in the file. */
import { EventType, type BaseEvent } from "@ag-ui/core";

const ERROR_FRAME_TYPE = EventType.RUN_ERROR;

export function emit(): BaseEvent {
  return {
    type: ERROR_FRAME_TYPE,
    message: "Typed through a bound identifier.",
    code: "TYPE_THROUGH_IDENTIFIER",
  };
}
