/** Sentences that reach the wire as arguments to a single-purpose builder. */
import { EventType, type BaseEvent } from "@ag-ui/core";

function resumeError(message: string): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message,
    code: "HELPER_ARGUMENT",
  };
}

export function emit(interruptId: string): BaseEvent {
  if (!interruptId) return resumeError("The helper argument sentence.");
  return resumeError(`Interrupt ${interruptId} is unknown.`);
}
