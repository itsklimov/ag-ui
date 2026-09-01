/** A code from a table the site reads under a key that is not one. */
import { EventType, type BaseEvent } from "@ag-ui/core";

const ALIASES: Record<string, string> = { THE_KEY: "FROM_A_MAPPING" };

export function emit(kind: boolean): BaseEvent {
  const failureCode = kind ? ALIASES["THE_KEY"] : "PLAIN_CODE";
  return {
    type: EventType.RUN_ERROR,
    message: "Reported under a code from a mapping.",
    code: failureCode,
  };
}
