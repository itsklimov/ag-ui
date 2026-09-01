"""Extraction reads each emission shape out of the shared synthetic corpus.

``error-code-corpus`` holds one tiny source per shape a terminal error frame
can be written in, on both sides, and ``expected.json`` states the codes,
message templates and unresolved count each one must yield. Pinning the
extractor against shapes rather than against the adapter is what makes a
blindness a failure here instead of a silently missing sentence in
``error-codes.json``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.error_code_extract import extract_source

SIDE = "python"
SIDES = ("python", "typescript")
CORPUS_ROOT = Path(__file__).resolve().parents[2] / "error-code-corpus"
SPEC: dict = json.loads((CORPUS_ROOT / "expected.json").read_text(encoding="utf-8"))
CASES: list[dict] = SPEC["cases"]
OUR_CASES = [case for case in CASES if SIDE in case["sides"]]


def _source(case: str) -> Path:
    return CORPUS_ROOT / SIDE / f"{case}.py"


@pytest.mark.parametrize("case", OUR_CASES, ids=lambda case: case["case"])
def test_the_corpus_case_extracts_as_recorded(case: dict) -> None:
    extraction = extract_source(_source(case["case"]))
    found = {
        code: sorted(messages)
        for code, messages in sorted(extraction.messages_by_code.items())
    }
    expected = {
        code: sorted(messages) for code, messages in sorted(case["codes"].items())
    }
    assert found == expected, f"codes and message text for {case['case']}"
    assert extraction.unresolved_sites == case["unresolved"], (
        f"unresolved construction sites in {case['case']}"
    )


def test_every_corpus_source_is_accounted_for() -> None:
    """An unlisted source is a shape nothing asserts anything about.

    Compared as sequences rather than as sets, so that a name listed twice is
    caught on this side as well as on the TypeScript one.
    """
    on_disk = sorted(path.stem for path in (CORPUS_ROOT / SIDE).glob("*.py"))
    assert on_disk == sorted(case["case"] for case in OUR_CASES)


def test_case_names_are_listed_once() -> None:
    """A name listed twice lets the second entry answer for the first."""
    names = [case["case"] for case in CASES]
    repeated = sorted({name for name in names if names.count(name) > 1})
    assert not repeated, f"case names listed more than once: {repeated}"


def test_every_case_names_the_sides_it_is_written_for() -> None:
    """A side that is empty or misspelled leaves a case inert but present."""
    for case in CASES:
        sides = case["sides"]
        assert sides, f"{case['case']} names no side"
        assert len(set(sides)) == len(sides), f"{case['case']} names a side twice"
        unknown = sorted(set(sides) - set(SIDES))
        assert not unknown, f"{case['case']} names unknown sides: {unknown}"


def test_shared_cases_are_written_on_both_sides() -> None:
    """A shape handled on one side and not the other is the defect to catch."""
    for case in CASES:
        if len(case["sides"]) < 2:
            continue
        for side, suffix in (("python", ".py"), ("typescript", ".ts")):
            assert (CORPUS_ROOT / side / f"{case['case']}{suffix}").exists()


def test_one_sided_cases_carry_a_reason() -> None:
    for case in CASES:
        if len(case["sides"]) == 1:
            assert case.get("note"), (
                f"{case['case']} is written for one side but carries no note"
            )
