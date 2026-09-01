/** A terminal frame whose type is written as an as-expression. */
import { type BaseEvent } from "@ag-ui/core";

export function emit(): BaseEvent {
  return {
    type: "RUN_ERROR" as const,
    message: "Typed with an as-expression.",
    code: "TYPE_AS_CONST",
  } as unknown as BaseEvent;
}
