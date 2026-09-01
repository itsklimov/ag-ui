/** A single-purpose builder written as an arrow function rather than a declaration. */
import { EventType, type BaseEvent } from "@ag-ui/core";

const resumeError = (message: string): BaseEvent => ({
  type: EventType.RUN_ERROR,
  message,
  code: "ARROW_BUILDER",
});

export function emit(interruptId: string): BaseEvent {
  if (!interruptId) return resumeError("The arrow builder sentence.");
  return resumeError(`Interrupt ${interruptId} is unknown.`);
}
