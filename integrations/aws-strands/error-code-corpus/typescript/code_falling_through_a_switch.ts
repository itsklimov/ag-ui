/** A code one switch clause sets for the clause it falls through into. */
import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(kind: string): BaseEvent | undefined {
  let failureCode = "BEFORE_THE_SWITCH";
  switch (kind) {
    case "first":
      failureCode = "SET_IN_THE_FIRST_CLAUSE";
    // falls through
    case "second":
      return {
        type: EventType.RUN_ERROR,
        message: "Reported from the second clause.",
        code: failureCode,
      };
  }
  return undefined;
}
