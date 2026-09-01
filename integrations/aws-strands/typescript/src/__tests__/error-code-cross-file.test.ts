/**
 * A builder called from the other module the extractor reads is read there.
 *
 * A single-purpose builder is answered for at its callers rather than where it
 * is written, because the sentence it puts on the wire arrives as an argument.
 * Searching for those callers in the builder's own file alone would leave a
 * caller in the other read module contributing nothing while the frame it came
 * from still read as delegated, which is the one disposition that loses a
 * message with no counter moving.
 *
 * The Python sibling pins the same spellings in
 * `test_error_code_extraction_soundness.py`.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { emittingFiles, extract } from "./error-code-extract";

const scratch = mkdtempSync(path.join(tmpdir(), "error-code-cross-file-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const BUILDER = `import { EventType, type BaseEvent } from "@ag-ui/core";

export function _resumeError(message: string): BaseEvent {
  return { type: EventType.RUN_ERROR, message, code: "CROSS_FILE" };
}
`;

let roots = 0;

/** A source root holding the two modules extraction reads, plus any others. */
function readSet(files: Record<string, string>): string {
  const root = path.join(scratch, `root-${(roots += 1)}`);
  mkdirSync(root);
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(path.join(root, name), source, "utf8");
  }
  return root;
}

function messages(root: string): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const [code, texts] of extract(root).messagesByCode) {
    found[code] = [...texts].sort();
  }
  return found;
}

describe("builders across the modules extraction reads", () => {
  it("reads a builder called from the other module at that call", () => {
    const root = readSet({
      "agent.ts": `${BUILDER}
export function emit(): BaseEvent {
  return _resumeError("The sentence written in the agent.");
}
`,
      "endpoint.ts": `import { _resumeError } from "./agent";

export function handle(): unknown {
  return _resumeError("The sentence written in the endpoint.");
}
`,
    });
    expect(messages(root)).toEqual({
      CROSS_FILE: [
        "The sentence written in the agent.",
        "The sentence written in the endpoint.",
      ],
    });
    expect(extract(root).unresolvedSites).toBe(0);
  });

  it("delegates a builder whose only caller is the other module", () => {
    // Nothing calls it where it is written, so nothing there pins its text.
    const root = readSet({
      "agent.ts": BUILDER,
      "endpoint.ts": `import { _resumeError as buildError } from "./agent";

export function handle(): unknown {
  return buildError("The sentence written in the endpoint.");
}
`,
    });
    expect(messages(root)).toEqual({
      CROSS_FILE: ["The sentence written in the endpoint."],
    });
  });

  it("reads a builder reached through the module holding it", () => {
    const root = readSet({
      "agent.ts": BUILDER,
      "endpoint.ts": `import * as agent from "./agent";

export function handle(): unknown {
  return agent._resumeError("The sentence written in the endpoint.");
}
`,
    });
    expect(messages(root)).toEqual({
      CROSS_FILE: ["The sentence written in the endpoint."],
    });
  });

  it("carries no sentence from a local named like the module", () => {
    // Only an import binds the name a builder can be reached through. Without
    // that, an unrelated object called `agent` would hand a sentence to the
    // contract by calling a method that happens to share the name.
    const root = readSet({
      "agent.ts": `${BUILDER}
export function emit(): BaseEvent {
  return _resumeError("The sentence written in the agent.");
}
`,
      "endpoint.ts": `interface Builders {
  _resumeError(message: string): unknown;
}

export function handle(agent: Builders): unknown {
  return agent._resumeError("Not this adapter's sentence.");
}
`,
    });
    expect(messages(root)).toEqual({
      CROSS_FILE: ["The sentence written in the agent."],
    });
  });

  it("reads a builder reached through a re-export barrel", () => {
    // A barrel is a module like any other to an import, so the name it hands
    // over has to be followed back to the module the builder is written in.
    // Stopping at the barrel drops the sentence its caller carries.
    const root = readSet({
      "agent.ts": BUILDER,
      "index.ts": `export { _resumeError as buildError } from "./agent";\n`,
      "endpoint.ts": `import { buildError } from "./index";

export function handle(): unknown {
  return buildError("The sentence written in the endpoint.");
}
`,
    });
    expect(messages(root)).toEqual({
      CROSS_FILE: ["The sentence written in the endpoint."],
    });
  });

  it("carries no sentence from a module outside the package", () => {
    // A module is the file it is, not the trailing name of the specifier that
    // reached it. A library module ending in one of ours would otherwise hand
    // its own sentence to the contract, and its call would answer for our
    // builder's frame as well, leaving the only recorded text foreign.
    const root = readSet({
      "agent.ts": `${BUILDER}
export function emit(): BaseEvent {
  return _resumeError("The sentence written in the agent.");
}
`,
      "endpoint.ts": `import { _resumeError } from "strands/agent";

export function handle(): unknown {
  return _resumeError("A sentence from the strands library.");
}
`,
    });
    expect(messages(root)).toEqual({
      CROSS_FILE: ["The sentence written in the agent."],
    });
  });

  it("names a module that only calls a builder as emitting", () => {
    // It writes no frame of its own, so nothing else would give it away.
    const root = readSet({
      "agent.ts": `${BUILDER}
export function emit(): BaseEvent {
  return _resumeError("The sentence written in the agent.");
}
`,
      "endpoint.ts": "export const nothing = true;\n",
      "relay.ts": `import { _resumeError } from "./agent";

export function handle(): unknown {
  return _resumeError("A sentence from an unlisted module.");
}
`,
    });
    expect(emittingFiles(root)).toContain("relay.ts");
  });

  it("names a module that reaches a builder through a barrel as emitting", () => {
    // The barrel is what the import names, and the builder is what it reaches.
    const root = readSet({
      "agent.ts": `${BUILDER}
export function emit(): BaseEvent {
  return _resumeError("The sentence written in the agent.");
}
`,
      "endpoint.ts": "export const nothing = true;\n",
      "index.ts": `export { _resumeError } from "./agent";\n`,
      "relay.ts": `import { _resumeError } from "./index";

export function handle(): unknown {
  return _resumeError("A sentence from an unlisted module.");
}
`,
    });
    expect(emittingFiles(root)).toContain("relay.ts");
  });
});
