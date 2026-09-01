/** The helper reached through a local alias of it. */
import { EventType, type BaseEvent } from "@ag-ui/core";

function _runError(message: string, code: string): BaseEvent {
  return { type: EventType.RUN_ERROR, message, code };
}

const emitFailure = _runError;

export function emit(): BaseEvent {
  return emitFailure("Reached through a helper alias.", "HELPER_ALIAS");
}
