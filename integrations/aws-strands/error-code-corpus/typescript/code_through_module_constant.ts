/** A code reached through a module-level constant. */
import { EventType, type BaseEvent } from "@ag-ui/core";

const MODULE_CODE = "THROUGH_MODULE_CONSTANT";

export function emit(): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "Resolved through a module constant.",
    code: MODULE_CODE,
  };
}
