/** A method sharing a builder's name, reached through the object that owns it. */
import { EventType, type BaseEvent } from "@ag-ui/core";

function resumeError(message: string): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message,
    code: "BUILDER_BY_NAME",
  };
}

const logger = {
  resumeError(message: string): void {
    void message;
  },
};

export function emit(): BaseEvent {
  logger.resumeError("Just a log line, not a wire message.");
  return resumeError("The builder sentence.");
}
