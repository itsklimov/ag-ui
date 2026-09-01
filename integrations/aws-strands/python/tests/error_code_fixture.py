"""The shared ``error-codes.json`` contract, read for the suites that pin it.

The parity suite compares this bridge's extracted codes and messages against
it. The behaviour suites take the shared message constants from here too, so
the text a client sees on the wire is asserted against the contract itself
rather than against a copy of it that can drift.

Every caller reads its own copy: the guard harness perturbs what it loads, and
a module-level object shared with the other suites would carry those edits into
them.
"""

from __future__ import annotations

import json
from pathlib import Path

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "error-codes.json"


def load_fixture(path: Path = FIXTURE_PATH) -> dict:
    """Read a contract file. The guard harness reads its perturbed copies with it."""
    return json.loads(path.read_text(encoding="utf-8"))


FORCE_STOP_FALLBACK: str = load_fixture()["sharedMessageConstants"]["forceStopFallback"]
