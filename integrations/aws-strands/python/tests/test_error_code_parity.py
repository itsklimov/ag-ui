"""The RUN_ERROR codes and message texts this bridge emits match the fixture.

``error-codes.json`` is shared with the TypeScript bridge, so a code or a
message that drifts on one side fails here rather than reaching a client that
matches either literally. A code only one bridge can emit is legitimate and
belongs in the fixture with a note; what this test refuses is an unrecorded one.

The assertions themselves live in ``error_code_assertions.py``, because
``test_error_code_guards.py`` drives the same ones against a deliberately
broken copy of the fixture to show each of them can fail. This suite runs every
assertion that module names, so a guard added there is never left unrun here.
"""

from __future__ import annotations

import pytest

from tests.error_code_assertions import ASSERTIONS, Assertion
from tests.error_code_extract import SOURCE_FILES, emitting_files, extract
from tests.error_code_fixture import load_fixture


@pytest.fixture
def fixture() -> dict:
    return load_fixture()


@pytest.fixture(scope="module")
def extraction():
    return extract()


@pytest.mark.parametrize(
    ("assertion",),
    [pytest.param(assertion, id=name) for name, assertion in ASSERTIONS.items()],
)
def test_the_contract_holds(fixture, extraction, assertion: Assertion) -> None:
    assertion(fixture, extraction)


def test_every_module_that_builds_terminal_frames_is_extracted_from() -> None:
    """Extraction reads a fixed list, so a third emitting module is a gap.

    Nothing in the fixture can break this one, which is why it is not among the
    assertions the mutation harness drives.
    """
    assert emitting_files() == set(SOURCE_FILES), (
        "Modules building RUN_ERROR frames no longer match the extracted list. "
        "Add the module to SOURCE_FILES and record its codes in error-codes.json."
    )
