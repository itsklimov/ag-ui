/**
 * Extraction reads each emission shape out of the shared synthetic corpus.
 *
 * `error-code-corpus` holds one tiny source per shape a terminal error frame
 * can be written in, on both sides, and `expected.json` states the codes,
 * message templates and unresolved count each one must yield. Pinning the
 * extractor against shapes rather than against the adapter is what makes a
 * blindness a failure here instead of a silently missing sentence in
 * `error-codes.json`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { extractSource } from "./error-code-extract";

const THIS_SIDE = "typescript";
const SIDES = ["python", "typescript"];

interface CorpusCase {
  case: string;
  sides: string[];
  codes: Record<string, string[]>;
  unresolved: number;
  note?: string;
}

const CORPUS_ROOT = path.resolve(__dirname, "../../../error-code-corpus");

const cases: CorpusCase[] = JSON.parse(
  readFileSync(path.join(CORPUS_ROOT, "expected.json"), "utf8"),
).cases;

const ourCases = cases.filter((entry) => entry.sides.includes(THIS_SIDE));

const sourcesOnDisk = (): string[] =>
  readdirSync(path.join(CORPUS_ROOT, THIS_SIDE)).filter((name) =>
    name.endsWith(".ts"),
  );

const sorted = (values: Iterable<string>): string[] => [...values].sort();

describe("RUN_ERROR emission shapes", () => {
  for (const entry of ourCases) {
    it(`reads ${entry.case} as recorded`, () => {
      const extraction = extractSource(
        path.join(CORPUS_ROOT, THIS_SIDE, `${entry.case}.ts`),
      );
      const found = Object.fromEntries(
        sorted(extraction.messagesByCode.keys()).map((code) => [
          code,
          sorted(extraction.messagesByCode.get(code)!),
        ]),
      );
      const expected = Object.fromEntries(
        sorted(Object.keys(entry.codes)).map((code) => [
          code,
          sorted(entry.codes[code]!),
        ]),
      );
      expect(found, `codes and message text for ${entry.case}`).toEqual(
        expected,
      );
      expect(
        extraction.unresolvedSites,
        `unresolved construction sites in ${entry.case}`,
      ).toBe(entry.unresolved);
    });
  }

  it("parses every corpus source", () => {
    // `ts.createSourceFile` recovers from a syntax error instead of raising, so
    // a broken source would otherwise extract whatever survived the recovery,
    // or nothing at all, and read as a shape nothing emits. Python's `ast.parse`
    // raises on its own. Syntactic diagnostics only: the corpus is compiled
    // against no libraries and resolves no imports.
    const files = sourcesOnDisk().map((name) =>
      path.join(CORPUS_ROOT, THIS_SIDE, name),
    );
    const program = ts.createProgram(files, {
      noResolve: true,
      noLib: true,
      noEmit: true,
      target: ts.ScriptTarget.Latest,
    });
    const complaints = files.flatMap((file) =>
      program
        .getSyntacticDiagnostics(program.getSourceFile(file))
        .map(
          (diagnostic) =>
            `${path.basename(file)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
        ),
    );
    expect(complaints).toEqual([]);
  });

  it("accounts for every corpus source", () => {
    // An unlisted source is a shape nothing asserts anything about.
    const onDisk = sourcesOnDisk().map((name) => name.replace(/\.ts$/, ""));
    expect(onDisk.sort()).toEqual(ourCases.map((entry) => entry.case).sort());
  });

  it("lists every case name once", () => {
    // A name listed twice lets the second entry answer for the first.
    const names = cases.map((entry) => entry.case);
    const repeated = [
      ...new Set(names.filter((name, index) => names.indexOf(name) !== index)),
    ];
    expect(repeated).toEqual([]);
  });

  it("names the sides every case is written for", () => {
    // A side that is empty or misspelled leaves a case inert but present.
    for (const entry of cases) {
      expect(entry.sides.length, `${entry.case} names no side`).toBeGreaterThan(
        0,
      );
      expect(
        [...new Set(entry.sides)].sort(),
        `${entry.case} names a side twice`,
      ).toEqual([...entry.sides].sort());
      expect(
        entry.sides.filter((side) => !SIDES.includes(side)),
        `${entry.case} names an unknown side`,
      ).toEqual([]);
    }
  });

  it("writes every shared case on both sides", () => {
    // A shape handled on one side and not the other is the defect to catch.
    for (const entry of cases) {
      if (entry.sides.length < 2) continue;
      for (const [side, suffix] of [
        ["python", ".py"],
        ["typescript", ".ts"],
      ] as const) {
        expect(
          existsSync(path.join(CORPUS_ROOT, side, `${entry.case}${suffix}`)),
          `${entry.case} on the ${side} side`,
        ).toBe(true);
      }
    }
  });

  it("gives every one-sided case a reason", () => {
    for (const entry of cases) {
      if (entry.sides.length === 1) {
        expect(
          entry.note,
          `${entry.case} is written for one side`,
        ).toBeTruthy();
      }
    }
  });
});
