/**
 * The RUN_ERROR codes and message texts this bridge emits match the fixture.
 *
 * `error-codes.json` is shared with the Python bridge, so a code or a message
 * that drifts on one side fails here rather than reaching a client that matches
 * either literally. A code only one bridge can emit is legitimate and belongs in
 * the fixture with a note; what this test refuses is an unrecorded one.
 *
 * The assertions themselves live in `error-code-assertions.ts`, because
 * `error-code-guards.test.ts` drives the same ones against a deliberately
 * broken copy of the fixture to show each of them can fail.
 */
import { describe, expect, it } from "vitest";

import { ASSERTIONS } from "./error-code-assertions";
import { SOURCE_FILES, emittingFiles, extract } from "./error-code-extract";
import { loadFixture } from "./error-code-fixture";

const extraction = extract();

describe("RUN_ERROR code parity", () => {
  for (const [name, assertion] of Object.entries(ASSERTIONS)) {
    it(name, () => {
      assertion(loadFixture(), extraction);
    });
  }

  it("extracts from every module that builds terminal frames", () => {
    // Extraction reads a fixed list, so a third emitting module is a gap: add
    // it to SOURCE_FILES and record its codes in error-codes.json. Nothing in
    // the fixture can break this one, which is why it is not among the
    // assertions the mutation harness drives.
    expect(emittingFiles().sort()).toEqual([...SOURCE_FILES].sort());
  });
});
