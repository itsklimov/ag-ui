/** A frame built inside a constructor, against a local that shadows the file. */
import { EventType, type BaseEvent } from "@ag-ui/core";

const failureCode = "AT_FILE_SCOPE";

export class Reporter {
  readonly frame: BaseEvent;

  constructor() {
    const failureCode = "IN_CONSTRUCTOR";
    this.frame = {
      type: EventType.RUN_ERROR,
      message: "Built in a constructor.",
      code: failureCode,
    };
  }
}
