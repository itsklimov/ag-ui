/** Two sibling branches binding the same local name to different codes. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(kind: string): BaseEvent | undefined {
  if (kind === "first") {
    const failureCode = "FIRST_SIBLING";
    return {
      type: EventType.RUN_ERROR,
      message: "The first sibling.",
      code: failureCode,
    };
  }
  if (kind === "second") {
    const failureCode = "SECOND_SIBLING";
    return {
      type: EventType.RUN_ERROR,
      message: "The second sibling.",
      code: failureCode,
    };
  }
  return undefined;
}
