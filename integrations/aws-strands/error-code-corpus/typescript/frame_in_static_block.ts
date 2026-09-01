/** A frame built inside a class static initialisation block. */
import { EventType, type BaseEvent } from "@ag-ui/core";

const failureCode = "AT_FILE_SCOPE";

export class Reporter {
  static frame: BaseEvent;

  static {
    const failureCode = "IN_STATIC_BLOCK";
    Reporter.frame = {
      type: EventType.RUN_ERROR,
      message: "Built in a static block.",
      code: failureCode,
    };
  }
}
