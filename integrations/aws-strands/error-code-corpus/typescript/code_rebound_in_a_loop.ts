/** A code a later iteration leaves live for the frame written above it. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function* emit(items: string[]): Generator<BaseEvent> {
  let failureCode = "FIRST_PASS";
  for (const item of items) {
    yield {
      type: EventType.RUN_ERROR,
      message: `Reported for ${item}.`,
      code: failureCode,
    };
    failureCode = "LATER_PASSES";
  }
}
