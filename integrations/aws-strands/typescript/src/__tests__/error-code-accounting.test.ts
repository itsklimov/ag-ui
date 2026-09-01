/**
 * Every terminal-error marker written in a source is answered for.
 *
 * Extraction states one rule about itself: a construction site is recorded
 * against the codes it resolves to, or counted unresolved. The rule is only
 * worth what recognition is worth, because a site recognition drops is in
 * neither track and costs nothing to leave broken. What is asserted here is
 * the join of the two: a literal carrying a `type` this file cannot read as
 * some other event type is a marker, and every marker has to come back listed
 * against the source it was written in.
 *
 * The marker reading below is deliberately its own, and deliberately blunter
 * than the extractor's: it dismisses a literal only when the type is spelled
 * out plainly and names something else, so anything cleverer than that spelling
 * lands in the set extraction owes an answer for. Reusing the extractor's own
 * recogniser here would assert nothing at all.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import {
  SOURCE_FILES,
  SRC_ROOT,
  extract,
  extractSource,
} from "./error-code-extract";

const RUN_ERROR = "RUN_ERROR";
const CORPUS = path.resolve(__dirname, "../../../error-code-corpus/typescript");

function stripped(node: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return stripped(node.expression);
  }
  return node;
}

function text(node: ts.Node): string | undefined {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : undefined;
}

/** The name an expression spells out, or `undefined` when it spells none. */
function spelledName(node: ts.Expression): string | undefined {
  const expression = stripped(node);
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression)) {
    return text(expression.argumentExpression);
  }
  return text(expression);
}

/** The `type` property of a literal, when it is keyed readably. */
function typeProperty(literal: ts.ObjectLiteralExpression): {
  present: boolean;
  value?: ts.Expression;
} {
  for (const property of literal.properties) {
    const key = property.name;
    const named =
      key === undefined
        ? undefined
        : ts.isIdentifier(key)
          ? key.text
          : ts.isComputedPropertyName(key)
            ? text(key.expression)
            : text(key);
    if (named !== "type") continue;
    if (ts.isPropertyAssignment(property)) {
      return { present: true, value: property.initializer };
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      return { present: true, value: property.name };
    }
    return { present: true };
  }
  return { present: false };
}

/** Where the markers extraction owes an answer for sit in a source. */
function markerPositions(file: string): number[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: number[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const type = typeProperty(node);
      const spelled = type.value ? spelledName(type.value) : undefined;
      if (type.present && (spelled === undefined || spelled === RUN_ERROR)) {
        found.push(node.getStart());
      }
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(source, walk);
  return found;
}

/**
 * Where a recognised site can start in a source.
 *
 * A site is recorded at the node that builds the frame or hands its parts over:
 * an object literal, a call, or the binding a packed pair is written into. A
 * position no such node sits at is a site filed against a file it was not read
 * in.
 */
function siteShapedPositions(file: string): Set<number> {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found = new Set<number>();
  const walk = (node: ts.Node): void => {
    if (
      ts.isObjectLiteralExpression(node) ||
      ts.isCallExpression(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isBinaryExpression(node)
    ) {
      found.add(node.getStart());
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(source, walk);
  return found;
}

interface Fixture {
  name: string;
  source: string;
  markers: number;
  unresolved: number;
  codes: string[];
}

// Shapes that write a type somewhere the plain reading above cannot settle,
// and shapes whose code is bound somewhere a reader can too easily answer from.
// Each is a frame the adapter could really write, and each is one that plain
// reading cannot dismiss.
const FIXTURES: Fixture[] = [
  {
    name: "opaque_binding_unresolved_code",
    source: `import { type BaseEvent } from "@ag-ui/core";

function frameType(): string {
  return "RUN_ERROR";
}

export function emit(code: string): BaseEvent {
  const type = frameType();
  return { type, message: "Hidden behind a call.", code } as unknown as BaseEvent;
}
`,
    markers: 1,
    unresolved: 1,
    codes: [],
  },
  {
    name: "opaque_binding_literal_code",
    source: `import { type BaseEvent } from "@ag-ui/core";

function frameType(): string {
  return "RUN_ERROR";
}

export function emit(): BaseEvent {
  const type = frameType();
  return {
    type,
    message: "Hidden behind a call.",
    code: "OPAQUE_BINDING",
  } as unknown as BaseEvent;
}
`,
    markers: 1,
    unresolved: 0,
    codes: ["OPAQUE_BINDING"],
  },
  {
    name: "imported_type_binding",
    source: `import { type BaseEvent } from "@ag-ui/core";
import { FRAME_TYPE } from "./elsewhere";

export function emit(code: string): BaseEvent {
  return {
    type: FRAME_TYPE,
    message: "Hidden behind an import.",
    code,
  } as unknown as BaseEvent;
}
`,
    markers: 1,
    unresolved: 1,
    codes: [],
  },
  {
    // A name is not evidence either way, so a literal typed through one is
    // answered for rather than dismissed, whatever the name happens to hold.
    name: "type_through_a_name",
    source: `import { EventType } from "@ag-ui/core";

export function emit(): Record<string, unknown> {
  const type = EventType.TEXT_MESSAGE_START;
  return { type, code: "THROUGH_A_NAME", message: "Typed through a name." };
}
`,
    markers: 1,
    unresolved: 0,
    codes: ["THROUGH_A_NAME"],
  },
  {
    // Called without `override` the frame carries whatever the caller passed,
    // which cannot be read, so the site is counted rather than recorded against
    // the one code written down here.
    name: "a_parameter_a_branch_reassigns",
    source: `import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(code: string, override: boolean): BaseEvent {
  if (override) code = "OVERRIDE_CODE";
  return { type: EventType.RUN_ERROR, message: "m", code };
}
`,
    markers: 1,
    unresolved: 1,
    codes: [],
  },
  {
    // The blunt reading tolerates a `type` key it cannot read plainly, and
    // these two are the spellings that reach that tolerance: a computed key,
    // and a key that carries no expression at all. Both leave the literal in
    // the set extraction owes an answer for, and extraction answers for both.
    name: "type_under_a_computed_key",
    source: `import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(): BaseEvent {
  return {
    ["type"]: EventType.RUN_ERROR,
    message: "Typed under a computed key.",
    code: "COMPUTED_TYPE_KEY",
  };
}
`,
    markers: 1,
    unresolved: 0,
    codes: ["COMPUTED_TYPE_KEY"],
  },
  {
    name: "type_through_an_accessor",
    source: `import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(): BaseEvent {
  return {
    get type() {
      return EventType.RUN_ERROR;
    },
    message: "Typed through an accessor.",
    code: "ACCESSOR_TYPE_KEY",
  } as unknown as BaseEvent;
}
`,
    markers: 1,
    unresolved: 0,
    codes: ["ACCESSOR_TYPE_KEY"],
  },
  {
    // The loop writes the target on every pass, and what it writes is the
    // iteration's own value, so the code the name held before the loop is not
    // the one the frame carries.
    name: "a_code_bound_by_a_loop_target",
    source: `import { EventType, type BaseEvent } from "@ag-ui/core";

export function* emit(codes: string[]): Generator<BaseEvent> {
  let code = "BEFORE_THE_LOOP";
  for (code of codes) {
    yield { type: EventType.RUN_ERROR, code, message: "Reported per item." };
  }
}
`,
    markers: 1,
    unresolved: 1,
    codes: [],
  },
  {
    // `overrides` can carry any code, so the one written above it is not what
    // the frame reaches the wire with.
    name: "a_code_a_spread_can_replace",
    source: `import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(overrides: Partial<BaseEvent>): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "A replaceable sentence.",
    code: "REPLACEABLE_CODE",
    ...overrides,
  } as BaseEvent;
}
`,
    markers: 1,
    unresolved: 1,
    codes: [],
  },
  {
    // A spread the code is written after is replaced by it, and reads as any
    // other literal does.
    name: "a_code_written_after_a_spread",
    source: `import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(defaults: Partial<BaseEvent>): BaseEvent {
  return {
    ...defaults,
    type: EventType.RUN_ERROR,
    message: "A sentence written after the spread.",
    code: "AFTER_THE_SPREAD",
  } as BaseEvent;
}
`,
    markers: 1,
    unresolved: 0,
    codes: ["AFTER_THE_SPREAD"],
  },
  {
    // What the literal holds under a key written twice is the last writing of
    // it, which is the code the wire carries.
    name: "a_code_written_twice",
    source: `import { EventType, type BaseEvent } from "@ag-ui/core";

export function emit(): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    message: "A duplicated-key sentence.",
    code: "FIRST_KEY",
    code: "LAST_KEY",
  } as BaseEvent;
}
`,
    markers: 1,
    unresolved: 0,
    codes: ["LAST_KEY"],
  },
  {
    // An async function returns a promise, so the literal its body returns is
    // not what the call evaluates to at the frame.
    name: "a_code_from_an_async_classifier",
    source: `import { EventType, type BaseEvent } from "@ag-ui/core";

async function classify(): Promise<string> {
  return "ASYNC_CODE";
}

export function emit(): BaseEvent {
  return {
    type: EventType.RUN_ERROR,
    code: classify() as unknown as string,
    message: "A promise is not a code.",
  };
}
`,
    markers: 1,
    unresolved: 1,
    codes: [],
  },
  {
    // What the destructuring hands the name is not written where it is bound,
    // so the file-scope constant of the same name is not what the frame carries.
    name: "a_code_bound_by_destructuring",
    source: `import { EventType, type BaseEvent } from "@ag-ui/core";

const code = "AT_FILE_SCOPE";

export function emit(failure: { code: string }): BaseEvent {
  const { code } = failure;
  return { type: EventType.RUN_ERROR, message: "m", code };
}
`,
    markers: 1,
    unresolved: 1,
    codes: [],
  },
];

const scratch = mkdtempSync(path.join(tmpdir(), "error-code-accounting-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function fixturePath(fixture: Fixture): string {
  const file = path.join(scratch, `${fixture.name}.ts`);
  writeFileSync(file, fixture.source, "utf8");
  return file;
}

const sources: [string, string][] = [
  ...SOURCE_FILES.map((name): [string, string] => [
    name,
    path.join(SRC_ROOT, name),
  ]),
  ...readdirSync(CORPUS)
    .filter((name) => name.endsWith(".ts"))
    .sort()
    .map((name): [string, string] => [
      `corpus/${name}`,
      path.join(CORPUS, name),
    ]),
  ...FIXTURES.map((fixture): [string, string] => [
    `fixture/${fixture.name}`,
    fixturePath(fixture),
  ]),
];

describe("RUN_ERROR site accounting", () => {
  for (const [name, file] of sources) {
    it(`answers for every marker in ${name}`, () => {
      const extraction = extractSource(file);
      const accounted = new Set(extraction.sites.map((site) => site.start));
      const unanswered = markerPositions(file).filter(
        (position) => !accounted.has(position),
      );
      expect(unanswered).toEqual([]);
    });

    it(`records or counts every site in ${name}`, () => {
      // A site listed unresolved and the pinned count are the same fact, so
      // neither can move without the other.
      const extraction = extractSource(file);
      expect(extraction.sites.filter((site) => !site.resolved).length).toBe(
        extraction.unresolvedSites,
      );
      expect(extraction.sites.every((site) => site.file === file)).toBe(true);
    });
  }

  // `extractSource` labels a site with the path it was handed, so the label and
  // the reading are one variable there and nothing about it can be wrong. The
  // multi-file read is the only one that can name the wrong file, and a site
  // filed against a module that does not write it is a code nobody can find.

  it("names the file every site was read in", () => {
    const extraction = extract();
    const positions = new Map(
      SOURCE_FILES.map((name): [string, Set<number>] => {
        const file = path.join(SRC_ROOT, name);
        return [file, siteShapedPositions(file)];
      }),
    );
    expect(new Set(extraction.sites.map((site) => site.file))).toEqual(
      new Set(positions.keys()),
    );
    for (const site of extraction.sites) {
      expect(
        positions.get(site.file)?.has(site.start),
        `${site.file} has no site starting at ${site.start}`,
      ).toBe(true);
    }
  });

  it("files a site in the second module against that module", () => {
    // Two modules whose sites sit at different offsets, so a swap cannot pass.
    const root = path.join(scratch, "read-set");
    mkdirSync(root, { recursive: true });
    const sources: Record<string, string> = {
      "agent.ts": `import { EventType, type BaseEvent } from "@ag-ui/core";

export function _resumeError(message: string): BaseEvent {
  return { type: EventType.RUN_ERROR, message, code: "CROSS_FILE" };
}
`,
      "endpoint.ts": `import { _resumeError } from "./agent";

export function handle(): unknown {
  return _resumeError("The sentence written in the endpoint.");
}
`,
    };
    for (const [name, source] of Object.entries(sources)) {
      writeFileSync(path.join(root, name), source, "utf8");
    }
    const extraction = extract(root);
    const positions = new Map(
      SOURCE_FILES.map((name): [string, Set<number>] => {
        const file = path.join(root, name);
        return [file, siteShapedPositions(file)];
      }),
    );
    expect(new Set(extraction.sites.map((site) => site.file))).toEqual(
      new Set(positions.keys()),
    );
    for (const site of extraction.sites) {
      expect(
        positions.get(site.file)?.has(site.start),
        `${site.file} has no site starting at ${site.start}`,
      ).toBe(true);
    }
  });

  it("finds the markers the adapter itself writes", () => {
    // A reading that found none would satisfy everything above vacuously.
    for (const name of SOURCE_FILES) {
      expect(
        markerPositions(path.join(SRC_ROOT, name)).length,
        `markers in ${name}`,
      ).toBeGreaterThan(0);
    }
  });

  for (const fixture of FIXTURES) {
    it(`reads ${fixture.name} as written`, () => {
      // Without these the accounting above would hold over an empty reading.
      const file = fixturePath(fixture);
      expect(markerPositions(file).length).toBe(fixture.markers);
      const extraction = extractSource(file);
      expect([...extraction.messagesByCode.keys()].sort()).toEqual(
        [...fixture.codes].sort(),
      );
      expect(extraction.unresolvedSites).toBe(fixture.unresolved);
    });
  }
});
