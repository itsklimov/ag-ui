/** Codes keyed by a quoted name, a literal computed name, and an opaque one. */
import { EventType, type BaseEvent } from "@ag-ui/core";

const CODE_KEY = "code";

export function quoted(): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "Keyed with a quoted name.",
    "code": "CODE_KEY_QUOTED",
  };
}

export function computed(): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "Keyed with a literal computed name.",
    ["code"]: "CODE_KEY_COMPUTED",
  };
}

export function opaque(): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "Keyed with an opaque computed name.",
    [CODE_KEY]: "CODE_KEY_OPAQUE",
  };
}
