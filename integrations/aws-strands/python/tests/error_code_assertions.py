"""The parity assertions this bridge makes against the shared error contract.

They live here rather than inside the test bodies so that two callers can drive
the same code: ``test_error_code_parity.py`` runs them against the checked-in
``error-codes.json``, and ``test_error_code_guards.py`` runs them against
perturbed copies of it to show that each one goes red when the property it
names is broken. A guard nothing can redden pins nothing, and a harness that
reimplements the guard proves nothing about the guard.

One claim per assertion, so that the perturbation named for a claim is the one
that reddens when that claim is dropped. Bundling several into one assertion
lets a reviewer delete all but one of them and keep the suite green.

Every assertion takes ``(fixture, extraction)`` so the harness can drive them
uniformly, whether or not one of them reads what this bridge emits.
"""

from __future__ import annotations

from typing import Callable

from tests.error_code_extract import Extraction, source_string_literals

SIDE = "python"

KNOWN_SIDES = frozenset({"python", "typescript"})

# The four typed interrupt-protocol failures this bridge introduced. TypeScript
# now emits three of them, and INTERRUPT_RESUME_ERROR is still this bridge's
# alone; symmetry must never be bought by dropping one.
TYPED_INTERRUPT_FAILURES = frozenset(
    {
        "INTERRUPT_SESSION_REQUIRED",
        "INTERRUPT_SESSION_CAPABILITY_ERROR",
        "INTERRUPT_RECONCILIATION_ERROR",
        "INTERRUPT_RESUME_ERROR",
    }
)


def listed_for_side(fixture: dict) -> dict[str, dict]:
    """Entries the fixture says this bridge emits, keyed by code."""
    return {
        entry["code"]: entry for entry in fixture["codes"] if SIDE in entry["sides"]
    }


def assert_each_code_is_listed_once(fixture: dict, extraction: Extraction) -> None:
    """A repeated entry would shadow the first one and drop the text it pins."""
    codes = [entry["code"] for entry in fixture["codes"]]
    repeated = sorted({code for code in codes if codes.count(code) > 1})
    assert not repeated, f"error-codes.json lists these codes twice: {repeated}"


def assert_every_entry_names_known_sides(
    fixture: dict, extraction: Extraction
) -> None:
    """An entry nobody is listed on satisfies every other guard vacuously.

    Empty, misspelled or repeated ``sides`` all read as "this bridge does not
    emit it" to the guards below, which is how an entry stops being checked at
    all without anything going red.
    """
    for entry in fixture["codes"]:
        code = entry["code"]
        sides = entry["sides"]
        assert sides, f"{code} lists no sides, so no bridge is held to it"
        unknown = sorted(set(sides) - KNOWN_SIDES)
        assert not unknown, f"{code} lists sides no bridge answers to: {unknown}"
        repeated = sorted({side for side in sides if sides.count(side) > 1})
        assert not repeated, f"{code} lists these sides twice: {repeated}"


def assert_emitted_codes_match_the_list(
    fixture: dict, extraction: Extraction
) -> None:
    listed = set(listed_for_side(fixture))
    assert extraction.codes == listed, (
        "RUN_ERROR codes emitted by this bridge no longer match error-codes.json. "
        f"Only in the source: {sorted(extraction.codes - listed)}. "
        f"Only in the fixture: {sorted(listed - extraction.codes)}."
    )


def assert_message_text_matches_the_list(
    fixture: dict, extraction: Extraction
) -> None:
    """Sorted lists, not sets, so a text written twice in the fixture fails.

    The TypeScript sibling compares the same way. Comparing sets there would
    let a duplicate pass on one side and fail on the other.
    """
    for code, entry in listed_for_side(fixture).items():
        expected = sorted(
            [*entry["messages"], *entry.get("sideOnlyMessages", {}).get(SIDE, [])]
        )
        actual = sorted(extraction.messages_by_code.get(code, set()))
        assert actual == expected, (
            f"RUN_ERROR message text for {code} no longer matches error-codes.json. "
            f"Emitted here: {actual}. Listed: {expected}."
        )


# ``messages`` is the text every listed side owes, ``sideOnlyMessages`` is not.
# The four claims that split holds are asserted one at a time below. Two of
# them are checked from this side only; the sibling suite checks the same two
# from the other side, and the pair is what makes the split a claim about both
# bridges.


def assert_side_only_text_names_a_listed_side(
    fixture: dict, extraction: Extraction
) -> None:
    """Text attributed to a side the entry is not listed on claims nothing."""
    for entry in fixture["codes"]:
        only: dict[str, list[str]] = entry.get("sideOnlyMessages", {})
        unlisted = sorted(set(only) - set(entry["sides"]))
        assert not unlisted, (
            f"{entry['code']} carries side-only text for sides it is not "
            f"listed on: {unlisted}"
        )


def assert_many_sided_entries_list_shared_text(
    fixture: dict, extraction: Extraction
) -> None:
    """Both bridges emit it, so the text they share has to be written down."""
    for entry in fixture["codes"]:
        if len(entry["sides"]) > 1 and not entry.get("sideOnlyMessages"):
            assert entry["messages"], (
                f"{entry['code']} is listed on {entry['sides']} but lists no "
                "shared message text"
            )


def assert_shared_text_is_produced_here(
    fixture: dict, extraction: Extraction
) -> None:
    """Shared text this bridge never renders is a promise it does not keep."""
    for entry in fixture["codes"]:
        if SIDE not in entry["sides"]:
            continue
        produced = extraction.messages_by_code.get(entry["code"], set())
        missing = sorted(set(entry["messages"]) - produced)
        assert not missing, (
            f"{entry['code']} lists shared text this bridge does not emit: {missing}"
        )


def assert_other_sides_only_text_is_not_produced_here(
    fixture: dict, extraction: Extraction
) -> None:
    """Text the fixture attributes to the other side alone must not be emitted here."""
    for entry in fixture["codes"]:
        if SIDE not in entry["sides"]:
            continue
        produced = extraction.messages_by_code.get(entry["code"], set())
        for other, texts in entry.get("sideOnlyMessages", {}).items():
            if other == SIDE:
                continue
            overlap = sorted(produced & set(texts))
            assert not overlap, (
                f"{entry['code']} attributes text to {other} alone that this "
                f"bridge also emits: {overlap}"
            )


def assert_one_sided_entries_carry_a_reason(
    fixture: dict, extraction: Extraction
) -> None:
    """A deliberate asymmetry is a reviewed edit, not something to discover."""
    for entry in fixture["codes"]:
        if len(entry["sides"]) == 1 or "sideOnlyMessages" in entry:
            assert entry.get("note"), (
                f"{entry['code']} is one-sided but carries no note saying why"
            )


def assert_typed_interrupt_failures_stay_listed(
    fixture: dict, extraction: Extraction
) -> None:
    missing = sorted(TYPED_INTERRUPT_FAILURES - set(listed_for_side(fixture)))
    assert not missing, (
        "error-codes.json no longer lists these typed interrupt failures for "
        f"this bridge: {missing}"
    )


def assert_force_stop_fallback_is_written_in_the_source(
    fixture: dict, extraction: Extraction
) -> None:
    """Emitted through a variable, so the literal is pinned where it is written.

    Literals only: a fallback left behind in a comment satisfies a search over
    the file text while emitting nothing. What actually reaches the wire is
    pinned in ``test_force_stop_empty_response.py``.
    """
    fallback = fixture["sharedMessageConstants"]["forceStopFallback"]
    assert fallback in source_string_literals(), (
        f"no source literal in this bridge writes the force-stop fallback: {fallback!r}"
    )


def assert_unresolved_emission_sites_are_accounted_for(
    fixture: dict, extraction: Extraction
) -> None:
    """A new indirect emitter has to be reviewed rather than silently skipped."""
    assert extraction.unresolved_sites == fixture["unresolvedEmissionSites"][SIDE]


Assertion = Callable[[dict, Extraction], None]

ASSERTIONS: dict[str, Assertion] = {
    "each code is listed once": assert_each_code_is_listed_once,
    "every entry names known sides": assert_every_entry_names_known_sides,
    "emitted codes match the list": assert_emitted_codes_match_the_list,
    "message text matches the list": assert_message_text_matches_the_list,
    "side-only text names a listed side": assert_side_only_text_names_a_listed_side,
    "many-sided entries list shared text": (
        assert_many_sided_entries_list_shared_text
    ),
    "shared text is produced here": assert_shared_text_is_produced_here,
    "the other side's side-only text is not produced here": (
        assert_other_sides_only_text_is_not_produced_here
    ),
    "one-sided entries carry a reason": assert_one_sided_entries_carry_a_reason,
    "typed interrupt failures stay listed": (
        assert_typed_interrupt_failures_stay_listed
    ),
    "the force-stop fallback is written in the source": (
        assert_force_stop_fallback_is_written_in_the_source
    ),
    "unresolved emission sites are accounted for": (
        assert_unresolved_emission_sites_are_accounted_for
    ),
}
