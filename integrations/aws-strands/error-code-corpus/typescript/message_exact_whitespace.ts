/** A sentence whose own spacing and line break are what reach the wire. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "Two  spaces, a\nline break, and a trailing space. ",
    code: "MESSAGE_EXACT_WHITESPACE",
  };
}
