/** A spread object that carries a code without being a terminal frame. */
const CONTEXT = { source: "tool" };

export function summarise(): Record<string, unknown> {
  return { ...CONTEXT, code: "NOT_A_FRAME", detail: "Not a terminal frame." };
}
