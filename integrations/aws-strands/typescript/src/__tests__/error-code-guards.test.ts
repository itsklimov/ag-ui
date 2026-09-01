/**
 * Every parity guard is shown to fail when the contract it guards is broken.
 *
 * A guard that cannot go red pins nothing, and reading one is not the same as
 * watching it fail. Each case here copies `error-codes.json` to a temporary
 * path, breaks one property in the copy, and drives the guards
 * `error-code-parity.test.ts` itself runs, from `error-code-assertions.ts`,
 * against it. The same code path, against real extraction from the real
 * source: only the contract file differs.
 *
 * The perturbed copy is built before the guard is driven, and a perturbation
 * that can no longer find what it edits throws `StaleAnchorError` rather than
 * an assertion failure. Building it inside the `toThrow()` expression instead
 * would let a stale anchor satisfy the expectation and leave the case green
 * with its guard never invoked.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { ASSERTIONS, SIDE } from "./error-code-assertions";
import { extract } from "./error-code-extract";
import {
  loadFixture,
  type CodeEntry,
  type Fixture,
  type Side,
} from "./error-code-fixture";

type Mutation = (fixture: Fixture) => void;

const SHARED_CODE = "PENDING_INTERRUPTS";
const SIDE_ONLY_TEXT_CODE = "SESSION_MANAGER_INVALID_TYPE";
const ONE_SIDED_CODE = "SEED_BUILD_ERROR";

const extraction = extract();
const scratch = mkdtempSync(path.join(tmpdir(), "error-codes-"));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A perturbation names something error-codes.json no longer contains. */
class StaleAnchorError extends Error {}

function entryFor(fixture: Fixture, code: string): CodeEntry {
  const found = fixture.codes.find((entry) => entry.code === code);
  if (!found) {
    throw new StaleAnchorError(`error-codes.json no longer lists ${code}`);
  }
  return found;
}

function drop(fixture: Fixture, code: string): void {
  entryFor(fixture, code);
  fixture.codes = fixture.codes.filter((entry) => entry.code !== code);
}

const PERTURBATIONS: Array<[string, string, Mutation]> = [
  [
    "adds a code",
    "emitted codes match the list",
    (fixture) => {
      fixture.codes.push({
        code: "INVENTED_CODE",
        sides: ["python", "typescript"],
        messages: ["Invented."],
      });
    },
  ],
  [
    "removes a code",
    "emitted codes match the list",
    (fixture) => drop(fixture, SHARED_CODE),
  ],
  [
    "rewords a shared message",
    "message text matches the list",
    (fixture) => {
      entryFor(fixture, SHARED_CODE).messages[0] += " Reworded.";
    },
  ],
  [
    "rewords a side-only message",
    "message text matches the list",
    (fixture) => {
      const only = entryFor(fixture, SIDE_ONLY_TEXT_CODE).sideOnlyMessages?.[
        SIDE
      ];
      if (!only) {
        throw new StaleAnchorError(
          `${SIDE_ONLY_TEXT_CODE} carries no ${SIDE} side-only text`,
        );
      }
      only[0] += " Reworded.";
    },
  ],
  [
    "pads a shared message with whitespace",
    "message text matches the list",
    (fixture) => {
      // A reword that only moves whitespace is still a reword: every space in
      // a template is a space the wire carries.
      const entry = entryFor(fixture, SHARED_CODE);
      entry.messages[0] = ` ${entry.messages[0].replace(" ", "  ")}`;
    },
  ],
  [
    "duplicates a code entry",
    "each code is listed once",
    (fixture) => {
      fixture.codes.push(
        JSON.parse(JSON.stringify(entryFor(fixture, SHARED_CODE))),
      );
    },
  ],
  [
    "duplicates a message",
    "message text matches the list",
    (fixture) => {
      const entry = entryFor(fixture, SHARED_CODE);
      entry.messages.push(entry.messages[0]);
    },
  ],
  [
    "empties an entry's sides",
    "every entry names known sides",
    (fixture) => {
      entryFor(fixture, SHARED_CODE).sides = [];
    },
  ],
  [
    "misspells a side",
    "every entry names known sides",
    (fixture) => {
      const entry = entryFor(fixture, SHARED_CODE);
      entry.sides = [...entry.sides, "typescrpit" as Side];
    },
  ],
  [
    "lists a side twice",
    "every entry names known sides",
    (fixture) => {
      const entry = entryFor(fixture, SHARED_CODE);
      entry.sides = [...entry.sides, entry.sides[0]];
    },
  ],
  [
    "attributes side-only text to an unlisted side",
    "side-only text names a listed side",
    (fixture) => {
      // Only the side the text is filed under is false. The entry keeps its
      // note, the text is invented so neither bridge emits it, and the side it
      // is filed under is a real bridge this entry is simply not listed on.
      const entry = entryFor(fixture, ONE_SIDED_CODE);
      const unlisted = (["python", "typescript"] as Side[]).find(
        (side) => !entry.sides.includes(side),
      )!;
      entry.sideOnlyMessages = {
        [unlisted]: ["Filed under a side this code is not listed on."],
      };
    },
  ],
  [
    "drops the shared text of a many-sided entry",
    "many-sided entries list shared text",
    (fixture) => {
      entryFor(fixture, SHARED_CODE).messages = [];
    },
  ],
  [
    "lists shared text no bridge emits",
    "shared text is produced here",
    (fixture) => {
      entryFor(fixture, SHARED_CODE).messages.push(
        "Shared text neither bridge writes.",
      );
    },
  ],
  [
    "attributes shared text to the other side alone",
    "the other side's side-only text is not produced here",
    (fixture) => {
      // The claim the guard is named for, and nothing else. The text stays
      // listed as shared, so what this bridge emits still matches what the
      // fixture says it emits, and the note keeps the asymmetry guard quiet.
      // All that is false is the claim that the other side alone renders it.
      const entry = entryFor(fixture, SHARED_CODE);
      const other = entry.sides.find((side) => side !== SIDE)!;
      entry.sideOnlyMessages = { [other]: [entry.messages[0]] };
      entry.note = "Perturbed.";
    },
  ],
  [
    "drops a one-sided note",
    "one-sided entries carry a reason",
    (fixture) => {
      const entry = entryFor(fixture, ONE_SIDED_CODE);
      if (!entry.note) {
        throw new StaleAnchorError(
          `${ONE_SIDED_CODE} no longer carries a note to drop`,
        );
      }
      delete entry.note;
    },
  ],
  [
    "drops the note of a two-sided entry carrying side-only text",
    "one-sided entries carry a reason",
    (fixture) => {
      // The other half of the reason guard, which one-sidedness never reaches.
      // An entry both bridges emit still owes a note when it carries text only
      // one of them renders, and anchoring every note perturbation on a
      // one-sided entry would leave that half deletable with the suite green.
      const entry = entryFor(fixture, SIDE_ONLY_TEXT_CODE);
      if (entry.sides.length < 2 || !entry.sideOnlyMessages) {
        throw new StaleAnchorError(
          `${SIDE_ONLY_TEXT_CODE} is no longer a many-sided entry carrying side-only text`,
        );
      }
      if (!entry.note) {
        throw new StaleAnchorError(
          `${SIDE_ONLY_TEXT_CODE} no longer carries a note to drop`,
        );
      }
      delete entry.note;
    },
  ],
  [
    "rewords the force-stop fallback",
    "the force-stop fallback is written in the source",
    (fixture) => {
      fixture.sharedMessageConstants.forceStopFallback += " Reworded.";
    },
  ],
  [
    "changes the unresolved site count",
    "unresolved emission sites are accounted for",
    (fixture) => {
      fixture.unresolvedEmissionSites[SIDE] =
        Number(fixture.unresolvedEmissionSites[SIDE]) + 1;
    },
  ],
];

function perturbed(name: string, mutate: Mutation): Fixture {
  const fixture = loadFixture();
  mutate(fixture);
  const copy = path.join(scratch, `${name.replace(/\W+/g, "-")}.json`);
  writeFileSync(copy, JSON.stringify(fixture, null, 2), "utf8");
  return loadFixture(copy);
}

describe("RUN_ERROR parity guards", () => {
  for (const [name, guardName, mutate] of PERTURBATIONS) {
    it(`goes red when the fixture ${name}`, () => {
      const guard = ASSERTIONS[guardName];
      guard(loadFixture(), extraction);

      const broken = perturbed(name, mutate);

      expect(() => guard(broken, extraction)).toThrow();
    });
  }

  it("breaks every guard at least once, and names no guard it does not have", () => {
    // An assertion nobody breaks here is one nobody has shown can break, and a
    // perturbation naming a guard that does not exist drives nothing at all.
    const covered = new Set(PERTURBATIONS.map(([, guardName]) => guardName));
    const named = new Set(Object.keys(ASSERTIONS));
    expect({
      guardsNoPerturbationReddens: [...named].filter((n) => !covered.has(n)),
      perturbationsNamingNoGuard: [...covered].filter((n) => !named.has(n)),
    }).toEqual({
      guardsNoPerturbationReddens: [],
      perturbationsNamingNoGuard: [],
    });
  });
});
