"""Every terminal-error marker written in a source is answered for.

Extraction states one rule about itself: a construction site is recorded
against the codes it resolves to, or counted unresolved. The rule is only worth
what recognition is worth, because a site recognition drops is in neither track
and costs nothing to leave broken. What is asserted here is the join of the
two: a call written under anything standing for a construction marker is a
marker, and every marker has to come back listed against the source it was
written in.

The marker reading comes from ``error_code_markers.py``, which is deliberately
its own and deliberately blunter than the extractor's. Reusing the extractor's
own recogniser here would assert nothing at all, which is the mistake
``test_an_unanswered_marker_is_reported`` exists to keep this suite from
drifting back into.
"""

from __future__ import annotations

import ast
import textwrap
from pathlib import Path

import pytest

from tests import error_code_extract
from tests.error_code_extract import SOURCE_FILES, SRC_ROOT, extract, extract_source
from tests.error_code_markers import marker_sites

CORPUS_ROOT = Path(__file__).resolve().parents[2] / "error-code-corpus" / "python"

PRELUDE = "from ag_ui.core import EventType, RunErrorEvent\n"


class Fixture:
    """A source written here, and what both readings must make of it."""

    def __init__(
        self, source: str, markers: int, unresolved: int, codes: set[str]
    ) -> None:
        self.source = source
        self.markers = markers
        self.unresolved = unresolved
        self.codes = codes


# Shapes that reach the constructor by a route a reader can walk past, and
# shapes whose code sits somewhere a reader can too easily answer from. Each is
# a frame this adapter could really write, and none is one the blunt reading
# above can dismiss.
FIXTURES: dict[str, Fixture] = {
    "marker_through_a_chained_alias": Fixture(
        """
        Frame = RunErrorEvent
        Alias = Frame

        def emit():
            return Alias(
                type=EventType.RUN_ERROR, message="m", code="CHAINED_ALIAS"
            )
        """,
        markers=1,
        unresolved=0,
        codes={"CHAINED_ALIAS"},
    ),
    "class_method_on_an_alias": Fixture(
        """
        Frame = RunErrorEvent

        def emit(detail):
            return Frame.model_construct(
                type=EventType.RUN_ERROR, message=detail, code="ALIAS_CLASS_METHOD"
            )
        """,
        markers=1,
        unresolved=0,
        codes={"ALIAS_CLASS_METHOD"},
    ),
    "class_method_carrying_a_parameter_code": Fixture(
        """
        def emit(code):
            return RunErrorEvent.model_construct(
                type=EventType.RUN_ERROR, message="m", code=code
            )
        """,
        markers=1,
        unresolved=1,
        codes=set(),
    ),
    "marker_through_the_module_holding_it": Fixture(
        """
        import ag_ui.core as core

        def emit():
            return core.RunErrorEvent(
                type=EventType.RUN_ERROR, message="m", code="THROUGH_THE_MODULE"
            )
        """,
        markers=1,
        unresolved=0,
        codes={"THROUGH_THE_MODULE"},
    ),
}

ADAPTER_SOURCES = [SRC_ROOT / name for name in SOURCE_FILES]
CORPUS_SOURCES = sorted(CORPUS_ROOT.glob("*.py"))
SOURCES = ADAPTER_SOURCES + CORPUS_SOURCES


def _written(tmp_path: Path, name: str, source: str) -> Path:
    path = tmp_path / f"{name}.py"
    path.write_text(PRELUDE + textwrap.dedent(source).strip() + "\n", encoding="utf-8")
    return path


def _unanswered(path: Path) -> list[tuple[int, int]]:
    accounted = {(site.line, site.column) for site in extract_source(path).sites}
    return [site for site in marker_sites(path) if site not in accounted]


@pytest.mark.parametrize("path", SOURCES, ids=lambda path: path.stem)
def test_every_marker_is_answered_for(path: Path) -> None:
    assert _unanswered(path) == [], (
        f"{path.name} has terminal-frame markers extraction neither recorded "
        "nor counted, so the contract is unenforced there while the suite is "
        "green."
    )


@pytest.mark.parametrize("path", SOURCES, ids=lambda path: path.stem)
def test_every_site_is_recorded_or_counted(path: Path) -> None:
    # A site listed unresolved and the pinned count are the same fact, so
    # neither can move without the other.
    extraction = extract_source(path)
    unresolved = [site for site in extraction.sites if not site.resolved]
    assert len(unresolved) == extraction.unresolved_sites
    assert all(site.file == path.name for site in extraction.sites)


def _call_positions(path: Path) -> set[tuple[int, int]]:
    module = ast.parse(path.read_text(encoding="utf-8"))
    return {
        (node.lineno, node.col_offset)
        for node in ast.walk(module)
        if isinstance(node, ast.Call)
    }


# ``extract_source`` labels a site with the path it was handed, so the label
# and the reading are one variable there and nothing about it can be wrong.
# The multi-file read is the only one that can name the wrong file, and a site
# filed against a module that does not write it is a code nobody can find.


def test_a_site_names_the_file_it_was_read_in() -> None:
    extraction = extract()
    positions = {name: _call_positions(SRC_ROOT / name) for name in SOURCE_FILES}
    for site in extraction.sites:
        assert site.file in positions, f"site filed against {site.file}"
        assert (site.line, site.column) in positions[site.file], (
            f"{site.file} has no call at line {site.line}"
        )


def test_a_site_in_the_second_module_is_not_filed_against_the_first(
    tmp_path: Path,
) -> None:
    """Two files whose sites sit on different lines, so a swap cannot pass."""
    root = tmp_path / "package"
    root.mkdir()
    for name, source in (
        (
            "agent.py",
            """
            def _resume_error(message):
                return RunErrorEvent(
                    type=EventType.RUN_ERROR, message=message, code="CROSS_FILE"
                )
            """,
        ),
        (
            "endpoint.py",
            """
            from .agent import _resume_error


            def handle():
                return _resume_error("The sentence written in the endpoint.")
            """,
        ),
    ):
        (root / name).write_text(
            PRELUDE + textwrap.dedent(source).strip() + "\n", encoding="utf-8"
        )
    extraction = extract(root)
    positions = {name: _call_positions(root / name) for name in SOURCE_FILES}
    assert {site.file for site in extraction.sites} == set(SOURCE_FILES)
    for site in extraction.sites:
        assert (site.line, site.column) in positions[site.file]


def test_the_adapter_writes_markers_this_reading_finds() -> None:
    """A reading that found none would satisfy everything above vacuously."""
    for path in ADAPTER_SOURCES:
        assert marker_sites(path), f"no markers found in {path.name}"


@pytest.mark.parametrize("name", sorted(FIXTURES), ids=sorted(FIXTURES))
def test_the_fixture_reads_as_written(tmp_path: Path, name: str) -> None:
    """Without these the accounting above would hold over an empty reading."""
    fixture = FIXTURES[name]
    path = _written(tmp_path, name, fixture.source)
    assert len(marker_sites(path)) == fixture.markers
    extraction = extract_source(path)
    assert extraction.codes == fixture.codes
    assert extraction.unresolved_sites == fixture.unresolved


def test_a_frame_dispatched_out_of_a_table_is_reported(tmp_path: Path) -> None:
    """The marker reading is a demand on extraction rather than an echo of it.

    A constructor put in a table and called back out of it is a frame this
    adapter could write, and one the extractor's dotted-chain reading sees no
    marker in. A reading that shared that blind spot would agree with it here
    and leave the code unenforced; this one names the site, and the accounting
    reports it.
    """
    path = _written(
        tmp_path,
        "dispatch_table",
        """
        FRAME_KINDS = {"error": RunErrorEvent}

        def emit():
            return FRAME_KINDS["error"](
                type=EventType.RUN_ERROR, message="m", code="DISPATCHED_CODE"
            )
        """,
    )
    markers = marker_sites(path)
    assert markers, "the marker reading walked past the dispatch too"
    assert extract_source(path).codes == set()
    assert _unanswered(path) == markers


def test_an_unanswered_marker_is_reported(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An accounting nothing can redden would pin nothing.

    Blinding recognition is exactly the defect it is for: the markers stay
    written, and no track takes them.
    """
    fixture = FIXTURES["marker_through_a_chained_alias"]
    path = _written(tmp_path, "unanswered", fixture.source)
    monkeypatch.setattr(
        error_code_extract._Visitor, "_frame_callee", lambda self, node: None
    )
    markers = marker_sites(path)
    # A marker reading derived from the extractor would empty with it here, and
    # two empty lists comparing equal would pass the control while asserting
    # nothing. What the reading finds has to survive the blinding.
    assert markers, "the marker reading found nothing to leave unanswered"
    assert _unanswered(path) == markers
