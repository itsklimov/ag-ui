/**
 * The shared `error-codes.json` contract, read once for the suites that pin it.
 *
 * The parity suite compares this bridge's extracted codes and messages against
 * it. The behaviour suites take the shared message constants from here too, so
 * the text a client sees on the wire is asserted against the contract itself
 * rather than against a copy of it that can drift.
 *
 * Every caller reads its own copy: the guard harness perturbs what it loads,
 * and a module-level object shared with the other suites would carry those
 * edits into them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export type Side = "python" | "typescript";

export interface CodeEntry {
  code: string;
  sides: Side[];
  messages: string[];
  sideOnlyMessages?: Partial<Record<Side, string[]>>;
  note?: string;
}

export interface Fixture {
  codes: CodeEntry[];
  sharedMessageConstants: Record<string, string>;
  unresolvedEmissionSites: Record<string, number | string>;
}

export const FIXTURE_PATH = path.resolve(
  __dirname,
  "../../../error-codes.json",
);

/** Read a contract file. The guard harness reads its perturbed copies with it. */
export function loadFixture(file: string = FIXTURE_PATH): Fixture {
  return JSON.parse(readFileSync(file, "utf8"));
}

export const FORCE_STOP_FALLBACK: string =
  loadFixture().sharedMessageConstants.forceStopFallback;
