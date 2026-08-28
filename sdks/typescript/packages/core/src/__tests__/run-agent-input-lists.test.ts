import { describe, expect, it } from "vitest";
import { RunAgentInputSchema } from "../schemas";
import type { RunAgentInput } from "../index";

// `tools` and `context` are OPTIONAL in the schema — "an absent key and an
// empty array mean the same thing" — but the TypeScript SDK materialises them,
// so every reader sees a list rather than narrowing a value with one meaning.
//
// Nothing pinned that before these tests. The generator's drift gate compares
// emitted text against what the generator emits, so removing the decision moves
// both sides together and the gate still passes; and the one fixture that
// exercises the case asserts only that parsing succeeded, which is true either
// way. Both halves of the decision are asserted here instead.
// Mirrors spec/draft/fixtures/RunAgentInput/valid/without-tools-or-context.json,
// inlined because this package's tsconfig carries no node types. That fixture
// is checked by the spec harness, which asserts only that parsing SUCCEEDS —
// true under both readings, which is why it never pinned this.
const WITHOUT_EITHER_KEY = { threadId: "t1", runId: "r1", messages: [] };

describe("RunAgentInput lists the SDK materialises", () => {
  it("parses an input with neither key into empty lists", () => {
    const parsed = RunAgentInputSchema.parse({ ...WITHOUT_EITHER_KEY });

    expect(parsed.tools).toEqual([]);
    expect(parsed.context).toEqual([]);
  });

  // The reason the default is a factory. zod stores a LITERAL default in the
  // schema and hands that same instance to every parse, so one consumer's push
  // reaches every later parse in the process — across runs, and across tenants
  // on a server that parses each request body. Making the field non-optional is
  // exactly what makes `input.tools.push(...)` read as safe, so the type invites
  // the mutation that the sharing punishes.
  it("gives each parse its own list, not one shared instance", () => {
    const base = WITHOUT_EITHER_KEY;

    const first = RunAgentInputSchema.parse({ ...base });
    const second = RunAgentInputSchema.parse({ ...base });

    expect(first.tools).not.toBe(second.tools);
    expect(first.context).not.toBe(second.context);

    first.tools.push({ name: "leaked", description: "from the first parse" });
    expect(RunAgentInputSchema.parse({ ...base }).tools).toEqual([]);
  });

  // An explicit null is NOT absence here: the schema types both as arrays and
  // lists nothing nullable, and `.default()` substitutes for undefined only.
  // Only RunAgentInput.state reads a bare null as absent.
  it("still rejects an explicit null", () => {
    const base = WITHOUT_EITHER_KEY;

    expect(RunAgentInputSchema.safeParse({ ...base, tools: null }).success).toBe(false);
    expect(RunAgentInputSchema.safeParse({ ...base, context: null }).success).toBe(false);
  });

  // Compile-time canary, in the idiom compat-types.test.ts already uses: the
  // emitted type must keep both fields REQUIRED, so a regression to `tools?:`
  // fails the build rather than quietly reintroducing the narrowing.
  it("keeps both fields required on the emitted type", () => {
    // @ts-expect-error tools and context are required on the emitted type
    const missing: RunAgentInput = { threadId: "t1", runId: "r1", messages: [] };
    const full: RunAgentInput = {
      threadId: "t1",
      runId: "r1",
      messages: [],
      tools: [],
      context: [],
    };

    expect(missing).toBeDefined();
    expect(full.tools).toEqual([]);
  });
});
