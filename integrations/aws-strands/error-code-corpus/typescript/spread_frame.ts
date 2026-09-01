/** A frame built by spreading a base frame and overriding its fields. */
import { EventType, type BaseEvent } from "@ag-ui/core";

const ERROR_BASE = {
  type: EventType.RUN_ERROR,
  message: "Base message.",
  code: "SPREAD_BASE",
};

export function emit(): BaseEvent {
  return {
    ...ERROR_BASE,
    message: "A spread-built message.",
    code: "SPREAD_FRAME",
  };
}
