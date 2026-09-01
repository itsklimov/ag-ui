/** A handler reporting the code its try body had already set. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(run: () => void): BaseEvent | undefined {
  let failureCode = "BEFORE_THE_TRY";
  try {
    failureCode = "SET_IN_THE_TRY";
    run();
  } catch {
    return {
      type: EventType.RUN_ERROR,
      message: "Reported from the handler.",
      code: failureCode,
    };
  }
  return undefined;
}
