"""Every parity guard is shown to fail when the contract it guards is broken.

A guard that cannot go red pins nothing, and reading one is not the same as
watching it fail. Each case here copies ``error-codes.json`` to a temporary
path, breaks one property in the copy, and drives the guards
``test_error_code_parity.py`` itself runs, from
``error_code_assertions.py``, against it. The same code path, against real
extraction from the real source: only the contract file differs.

The perturbed copy is built before the guard is driven, and a perturbation that
can no longer find what it edits raises ``StaleAnchor`` rather than an
``AssertionError``. Building it inside the ``pytest.raises`` block instead would
let a stale anchor satisfy the expectation and leave the case green with its
guard never invoked.
"""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Callable

import pytest

from tests.error_code_assertions import ASSERTIONS, SIDE
from tests.error_code_extract import extract
from tests.error_code_fixture import load_fixture

Mutation = Callable[[dict], None]

_SHARED_CODE = "PENDING_INTERRUPTS"
_SIDE_ONLY_TEXT_CODE = "SESSION_MANAGER_INVALID_TYPE"
_ONE_SIDED_CODE = "SEED_BUILD_ERROR"
_TYPED_FAILURE_CODE = "INTERRUPT_SESSION_REQUIRED"


class StaleAnchor(Exception):
    """A perturbation names something error-codes.json no longer contains."""


def _entry(fixture: dict, code: str) -> dict:
    for entry in fixture["codes"]:
        if entry["code"] == code:
            return entry
    raise StaleAnchor(f"error-codes.json no longer lists {code}")


def _drop(fixture: dict, code: str) -> None:
    _entry(fixture, code)
    fixture["codes"] = [
        entry for entry in fixture["codes"] if entry["code"] != code
    ]


def _add_a_code(fixture: dict) -> None:
    fixture["codes"].append(
        {
            "code": "INVENTED_CODE",
            "sides": ["python", "typescript"],
            "messages": ["Invented."],
        }
    )


def _remove_a_code(fixture: dict) -> None:
    _drop(fixture, _SHARED_CODE)


def _remove_a_typed_interrupt_failure(fixture: dict) -> None:
    _drop(fixture, _TYPED_FAILURE_CODE)


def _reword_a_shared_message(fixture: dict) -> None:
    entry = _entry(fixture, _SHARED_CODE)
    entry["messages"][0] += " Reworded."


def _reword_a_side_only_message(fixture: dict) -> None:
    entry = _entry(fixture, _SIDE_ONLY_TEXT_CODE)
    only = entry.get("sideOnlyMessages", {})
    if SIDE not in only:
        raise StaleAnchor(f"{_SIDE_ONLY_TEXT_CODE} carries no {SIDE} side-only text")
    only[SIDE][0] += " Reworded."


def _pad_a_shared_message(fixture: dict) -> None:
    """A reword that only moves whitespace is still a reword.

    Every space in a template is a space the wire carries, so padding one is
    the same kind of drift as rewriting a word, and has to fail the same way.
    """
    entry = _entry(fixture, _SHARED_CODE)
    entry["messages"][0] = " " + entry["messages"][0].replace(" ", "  ", 1)


def _duplicate_a_code_entry(fixture: dict) -> None:
    fixture["codes"].append(deepcopy(_entry(fixture, _SHARED_CODE)))


def _duplicate_a_message(fixture: dict) -> None:
    entry = _entry(fixture, _SHARED_CODE)
    entry["messages"].append(entry["messages"][0])


def _empty_the_sides(fixture: dict) -> None:
    _entry(fixture, _SHARED_CODE)["sides"] = []


def _misspell_a_side(fixture: dict) -> None:
    entry = _entry(fixture, _SHARED_CODE)
    entry["sides"] = [*entry["sides"], "typescrpit"]


def _list_a_side_twice(fixture: dict) -> None:
    entry = _entry(fixture, _SHARED_CODE)
    entry["sides"] = [*entry["sides"], entry["sides"][0]]


def _attribute_side_only_text_to_an_unlisted_side(fixture: dict) -> None:
    """Only the side the text is filed under is false.

    The entry keeps its note, the text is invented so neither bridge emits it,
    and the side it is filed under is a real bridge that this entry is simply
    not listed on.
    """
    entry = _entry(fixture, _ONE_SIDED_CODE)
    unlisted = next(
        side for side in ("python", "typescript") if side not in entry["sides"]
    )
    entry["sideOnlyMessages"] = {
        unlisted: ["Filed under a side this code is not listed on."]
    }


def _drop_the_shared_text_of_a_many_sided_entry(fixture: dict) -> None:
    _entry(fixture, _SHARED_CODE)["messages"] = []


def _list_shared_text_no_bridge_emits(fixture: dict) -> None:
    entry = _entry(fixture, _SHARED_CODE)
    entry["messages"].append("Shared text neither bridge writes.")


def _attribute_shared_text_to_the_other_side(fixture: dict) -> None:
    """The claim the guard is named for, and nothing else.

    The text stays listed as shared, so what this bridge emits still matches
    what the fixture says it emits, and the note keeps the asymmetry guard
    quiet. All that is false is the claim that the other side alone renders it.
    """
    entry = _entry(fixture, _SHARED_CODE)
    other = next(side for side in entry["sides"] if side != SIDE)
    entry["sideOnlyMessages"] = {other: [entry["messages"][0]]}
    entry["note"] = "Perturbed."


def _drop_a_one_sided_note(fixture: dict) -> None:
    entry = _entry(fixture, _ONE_SIDED_CODE)
    if "note" not in entry:
        raise StaleAnchor(f"{_ONE_SIDED_CODE} no longer carries a note to drop")
    entry.pop("note")


def _drop_a_two_sided_side_only_note(fixture: dict) -> None:
    """The other half of the reason guard, which one-sidedness never reaches.

    An entry both bridges emit still owes a note when it carries text only one
    of them renders. Anchoring every note perturbation on a one-sided entry
    would leave that half of the guard deletable with the suite green.
    """
    entry = _entry(fixture, _SIDE_ONLY_TEXT_CODE)
    if len(entry["sides"]) < 2 or not entry.get("sideOnlyMessages"):
        raise StaleAnchor(
            f"{_SIDE_ONLY_TEXT_CODE} is no longer a many-sided entry carrying "
            "side-only text"
        )
    if "note" not in entry:
        raise StaleAnchor(
            f"{_SIDE_ONLY_TEXT_CODE} no longer carries a note to drop"
        )
    entry.pop("note")


def _reword_the_force_stop_fallback(fixture: dict) -> None:
    fixture["sharedMessageConstants"]["forceStopFallback"] += " Reworded."


def _change_the_unresolved_site_count(fixture: dict) -> None:
    fixture["unresolvedEmissionSites"][SIDE] += 1


PERTURBATIONS: list[tuple[str, str, Mutation]] = [
    ("adds a code", "emitted codes match the list", _add_a_code),
    ("removes a code", "emitted codes match the list", _remove_a_code),
    (
        "removes a typed interrupt failure",
        "typed interrupt failures stay listed",
        _remove_a_typed_interrupt_failure,
    ),
    (
        "rewords a shared message",
        "message text matches the list",
        _reword_a_shared_message,
    ),
    (
        "rewords a side-only message",
        "message text matches the list",
        _reword_a_side_only_message,
    ),
    (
        "pads a shared message with whitespace",
        "message text matches the list",
        _pad_a_shared_message,
    ),
    (
        "duplicates a code entry",
        "each code is listed once",
        _duplicate_a_code_entry,
    ),
    (
        "duplicates a message",
        "message text matches the list",
        _duplicate_a_message,
    ),
    ("empties an entry's sides", "every entry names known sides", _empty_the_sides),
    ("misspells a side", "every entry names known sides", _misspell_a_side),
    ("lists a side twice", "every entry names known sides", _list_a_side_twice),
    (
        "attributes side-only text to an unlisted side",
        "side-only text names a listed side",
        _attribute_side_only_text_to_an_unlisted_side,
    ),
    (
        "drops the shared text of a many-sided entry",
        "many-sided entries list shared text",
        _drop_the_shared_text_of_a_many_sided_entry,
    ),
    (
        "lists shared text no bridge emits",
        "shared text is produced here",
        _list_shared_text_no_bridge_emits,
    ),
    (
        "attributes shared text to the other side alone",
        "the other side's side-only text is not produced here",
        _attribute_shared_text_to_the_other_side,
    ),
    (
        "drops a one-sided note",
        "one-sided entries carry a reason",
        _drop_a_one_sided_note,
    ),
    (
        "drops the note of a two-sided entry carrying side-only text",
        "one-sided entries carry a reason",
        _drop_a_two_sided_side_only_note,
    ),
    (
        "rewords the force-stop fallback",
        "the force-stop fallback is written in the source",
        _reword_the_force_stop_fallback,
    ),
    (
        "changes the unresolved site count",
        "unresolved emission sites are accounted for",
        _change_the_unresolved_site_count,
    ),
]


@pytest.fixture(scope="module")
def extraction():
    return extract()


def _perturbed(tmp_path: Path, mutate: Mutation) -> dict:
    fixture = load_fixture()
    mutate(fixture)
    copy = tmp_path / "error-codes.json"
    copy.write_text(json.dumps(fixture, indent=2), encoding="utf-8")
    return load_fixture(copy)


@pytest.mark.parametrize(
    ("guard_name", "mutate"),
    [
        pytest.param(guard_name, mutate, id=case)
        for case, guard_name, mutate in PERTURBATIONS
    ],
)
def test_a_broken_contract_reddens_its_guard(
    tmp_path: Path, extraction, guard_name: str, mutate: Mutation
) -> None:
    guard = ASSERTIONS[guard_name]
    guard(load_fixture(), extraction)

    broken = _perturbed(tmp_path, mutate)

    with pytest.raises(AssertionError):
        guard(broken, extraction)


def test_every_guard_is_covered_by_a_perturbation() -> None:
    """An assertion nobody breaks here is one nobody has shown can break."""
    covered = {guard_name for _, guard_name, _ in PERTURBATIONS}
    named = set(ASSERTIONS)
    assert covered == named, (
        f"guards no perturbation reddens: {sorted(named - covered)}. "
        f"perturbations naming no guard: {sorted(covered - named)}."
    )
