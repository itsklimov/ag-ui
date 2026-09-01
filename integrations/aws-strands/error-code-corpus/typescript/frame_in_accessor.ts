/** A frame built inside a get accessor. */
import { EventType, type BaseEvent } from "@ag-ui/core";

const failureCode = "AT_FILE_SCOPE";

export class Reporter {
  get failure(): BaseEvent {
    const failureCode = "IN_ACCESSOR";
    return {
      type: EventType.RUN_ERROR,
      message: "Built in an accessor.",
      code: failureCode,
    };
  }
}
