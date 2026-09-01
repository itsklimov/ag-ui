/** A frame built through the helper that early-exit paths funnel into. */
import { EventType, type BaseEvent } from "@ag-ui/core";

function _runError(message: string, code: string): BaseEvent {
  return { type: EventType.RUN_ERROR, message, code };
}

export function emit(): BaseEvent {
  return _runError("Built through the helper.", "HELPER_MARKER");
}
