/**
 * The parity assertions this bridge makes against the shared error contract.
 *
 * They live here rather than inside the test bodies so that two callers can
 * drive the same code: `error-code-parity.test.ts` runs them against the
 * checked-in `error-codes.json`, and `error-code-guards.test.ts` runs them
 * against perturbed copies of it to show that each one goes red when the
 * property it names is broken. A guard nothing can redden pins nothing, and a
 * harness that reimplements the guard proves nothing about the guard.
 *
 * One claim per assertion, so that the perturbation named for a claim is the
 * one that reddens when that claim is dropped. Bundling several into one
 * assertion lets a reviewer delete all but one of them and keep the suite
 * green.
 *
 * Every assertion takes `(fixture, extraction)` so the harness can drive them
 * uniformly, whether or not one of them reads what this bridge emits.
 */
import { expect } from "vitest";

import type { Extraction } from "./error-code-extract";
import { sourceStringLiterals } from "./error-code-extract";
import type { CodeEntry, Fixture, Side } from "./error-code-fixture";

export const SIDE: Side = "typescript";

export const KNOWN_SIDES: readonly string[] = ["python", "typescript"];

export type Assertion = (fixture: Fixture, extraction: Extraction) => void;

/** Entries the fixture says this bridge emits, keyed by code. */
export const listedForSide = (fixture: Fixture): Map<string, CodeEntry> =>
  new Map(
    fixture.codes
      .filter((entry) => entry.sides.includes(SIDE))
      .map((entry) => [entry.code, entry]),
  );

const eachCodeIsListedOnce: Assertion = (fixture) => {
  // A repeated entry would shadow the first one and drop the text it pins.
  const codes = fixture.codes.map((entry) => entry.code);
  const repeated = [
    ...new Set(codes.filter((code, at) => codes.indexOf(code) !== at)),
  ].sort();
  expect(repeated, "codes listed twice in error-codes.json").toEqual([]);
};

/**
 * An entry nobody is listed on satisfies every other guard vacuously.
 *
 * Empty, misspelled or repeated `sides` all read as "this bridge does not emit
 * it" to the guards below, which is how an entry stops being checked at all
 * without anything going red.
 */
const everyEntryNamesKnownSides: Assertion = (fixture) => {
  for (const entry of fixture.codes) {
    expect(
      entry.sides,
      `${entry.code} lists no sides, so no bridge is held to it`,
    ).not.toEqual([]);
    const unknown = entry.sides.filter((side) => !KNOWN_SIDES.includes(side));
    expect(unknown, `${entry.code} lists sides no bridge answers to`).toEqual(
      [],
    );
    const repeated = [
      ...new Set(
        entry.sides.filter((side, at) => entry.sides.indexOf(side) !== at),
      ),
    ].sort();
    expect(repeated, `${entry.code} lists sides twice`).toEqual([]);
  }
};

const emittedCodesMatchTheList: Assertion = (fixture, extraction) => {
  const listed = [...listedForSide(fixture).keys()].sort();
  expect([...extraction.messagesByCode.keys()].sort()).toEqual(listed);
};

const messageTextMatchesTheList: Assertion = (fixture, extraction) => {
  // Sorted lists, not sets, so a text written twice in the fixture fails. The
  // Python sibling compares the same way.
  for (const [code, entry] of listedForSide(fixture)) {
    const expected = [
      ...entry.messages,
      ...(entry.sideOnlyMessages?.[SIDE] ?? []),
    ].sort();
    const actual = [...(extraction.messagesByCode.get(code) ?? [])].sort();
    expect(actual, `message text for ${code}`).toEqual(expected);
  }
};

// `messages` is the text every listed side owes, `sideOnlyMessages` is not. The
// four claims that split holds are asserted one at a time below. Two of them
// are checked from this side only; the sibling suite checks the same two from
// the other side, and the pair is what makes the split a claim about both
// bridges.

/** Text attributed to a side the entry is not listed on claims nothing. */
const sideOnlyTextNamesAListedSide: Assertion = (fixture) => {
  for (const entry of fixture.codes) {
    const unlisted = Object.keys(entry.sideOnlyMessages ?? {}).filter(
      (side) => !entry.sides.includes(side as Side),
    );
    expect(
      unlisted,
      `${entry.code} carries side-only text for sides it is not listed on`,
    ).toEqual([]);
  }
};

/** Both bridges emit it, so the text they share has to be written down. */
const manySidedEntriesListSharedText: Assertion = (fixture) => {
  for (const entry of fixture.codes) {
    const only = entry.sideOnlyMessages ?? {};
    if (entry.sides.length > 1 && Object.keys(only).length === 0) {
      expect(
        entry.messages.length,
        `${entry.code} is listed on ${entry.sides.join(", ")} but lists no shared message text`,
      ).toBeGreaterThan(0);
    }
  }
};

/** Shared text this bridge never renders is a promise it does not keep. */
const sharedTextIsProducedHere: Assertion = (fixture, extraction) => {
  for (const entry of fixture.codes) {
    if (!entry.sides.includes(SIDE)) continue;
    const produced = extraction.messagesByCode.get(entry.code) ?? new Set();
    const missing = entry.messages.filter((text) => !produced.has(text));
    expect(
      missing,
      `${entry.code} lists shared text this bridge does not emit`,
    ).toEqual([]);
  }
};

/** Text the fixture gives the other side alone must not be emitted here. */
const otherSidesOnlyTextIsNotProducedHere: Assertion = (
  fixture,
  extraction,
) => {
  for (const entry of fixture.codes) {
    if (!entry.sides.includes(SIDE)) continue;
    const produced = extraction.messagesByCode.get(entry.code) ?? new Set();
    for (const [other, texts] of Object.entries(entry.sideOnlyMessages ?? {})) {
      if (other === SIDE) continue;
      const overlap = (texts ?? []).filter((text) => produced.has(text));
      expect(
        overlap,
        `${entry.code} attributes text to ${other} alone that this bridge also emits`,
      ).toEqual([]);
    }
  }
};

const oneSidedEntriesCarryAReason: Assertion = (fixture) => {
  // A deliberate asymmetry is a reviewed edit, not something to discover.
  for (const entry of fixture.codes) {
    if (entry.sides.length === 1 || entry.sideOnlyMessages) {
      expect(entry.note, `${entry.code} is one-sided`).toBeTruthy();
    }
  }
};

const forceStopFallbackIsWrittenInTheSource: Assertion = (fixture) => {
  // Literals only: a fallback left behind in a comment satisfies a search over
  // the file text while emitting nothing. What actually reaches the wire is
  // pinned in `stop-reasons.test.ts`.
  expect(
    [...sourceStringLiterals()],
    "no source literal in this bridge writes the force-stop fallback",
  ).toContain(fixture.sharedMessageConstants.forceStopFallback);
};

const unresolvedEmissionSitesAreAccountedFor: Assertion = (
  fixture,
  extraction,
) => {
  // A new indirect emitter has to be reviewed rather than silently skipped.
  expect(extraction.unresolvedSites).toBe(
    fixture.unresolvedEmissionSites[SIDE],
  );
};

export const ASSERTIONS: Record<string, Assertion> = {
  "each code is listed once": eachCodeIsListedOnce,
  "every entry names known sides": everyEntryNamesKnownSides,
  "emitted codes match the list": emittedCodesMatchTheList,
  "message text matches the list": messageTextMatchesTheList,
  "side-only text names a listed side": sideOnlyTextNamesAListedSide,
  "many-sided entries list shared text": manySidedEntriesListSharedText,
  "shared text is produced here": sharedTextIsProducedHere,
  "the other side's side-only text is not produced here":
    otherSidesOnlyTextIsNotProducedHere,
  "one-sided entries carry a reason": oneSidedEntriesCarryAReason,
  "the force-stop fallback is written in the source":
    forceStopFallbackIsWrittenInTheSource,
  "unresolved emission sites are accounted for":
    unresolvedEmissionSitesAreAccountedFor,
};
