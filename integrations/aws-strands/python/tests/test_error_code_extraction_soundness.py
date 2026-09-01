"""Extraction records or counts every terminal-frame site it recognises.

``test_error_code_corpus.py`` pins what extraction reads out of each shape
anyone has thought of. This suite pins the rule the extractor states about the
shapes nobody has: a site written with a recognised marker is recorded against
the codes its code expression can evaluate to there, or counted as unresolved,
and there is no third disposition. A dispatch path that silently records
nothing and counts nothing is the failure this suite exists to catch, because
it leaves the pinned unresolved count untouched while the contract stops being
enforced.

Recognised sites are counted through ``error_code_markers.py``, a reading that
does not consult the extractor, so the balance is a claim about the extractor
and not a restatement of it. ``test_the_balance_goes_red_when_a_site_is_dropped``
shows it can fail. Where those sites are, rather than how many, is
``test_error_code_accounting.py``'s business.

Two examples follow the balance, one for each way a resolution that reads
broad evidence rather than the value live at the frame reports a contract the
adapter does not keep: a literal that is in the source but is not what the
code expression evaluates to, and a real emission under a name that resolves
to the wrong binding.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from tests import error_code_extract
from tests.error_code_extract import SOURCE_FILES, SRC_ROOT, extract_source
from tests.error_code_markers import marker_sites

CORPUS_ROOT = Path(__file__).resolve().parents[2] / "error-code-corpus" / "python"

PRELUDE = "from ag_ui.core import EventType, RunErrorEvent\n"

# One source per way of writing a frame that the corpus does not cover, each
# chosen because its code expression, or the frame itself, sits somewhere the
# dispatch could plausibly walk past. What any of them reads out is the
# corpus's business; that each is either read or counted is this suite's.
SHAPES: dict[str, str] = {
    "code_from_a_walrus": """
        def emit():
            return RunErrorEvent(
                type=EventType.RUN_ERROR, message="m", code=(bound := "WALRUS")
            )
    """,
    "code_from_a_loop_target": """
        def emit(codes):
            for code in codes:
                yield RunErrorEvent(type=EventType.RUN_ERROR, message="m", code=code)
    """,
    "code_from_a_global": """
        code = "AT_FILE_SCOPE"

        def emit():
            global code
            code = "REBOUND_GLOBAL"
            return RunErrorEvent(type=EventType.RUN_ERROR, message="m", code=code)
    """,
    "code_from_an_except_binding": """
        def emit(run):
            try:
                run()
            except Exception as code:
                return RunErrorEvent(
                    type=EventType.RUN_ERROR, message="m", code=code
                )
            return None
    """,
    "code_from_a_subscript": """
        CODES = {"first": "FROM_A_MAPPING"}

        def emit(kind):
            return RunErrorEvent(
                type=EventType.RUN_ERROR, message="m", code=CODES[kind]
            )
    """,
    "code_from_an_augmented_assignment": """
        def emit(suffix):
            code = "PREFIX"
            code += suffix
            return RunErrorEvent(type=EventType.RUN_ERROR, message="m", code=code)
    """,
    "code_from_a_match_capture": """
        def emit(kind):
            match kind:
                case str() as code:
                    return RunErrorEvent(
                        type=EventType.RUN_ERROR, message="m", code=code
                    )
            return None
    """,
    "code_from_a_comprehension_variable": """
        def emit(codes):
            return [
                RunErrorEvent(type=EventType.RUN_ERROR, message="m", code=code)
                for code in codes
            ]
    """,
    "frame_in_a_lambda": """
        build = lambda: RunErrorEvent(
            type=EventType.RUN_ERROR, message="m", code="IN_A_LAMBDA"
        )
    """,
    "frame_in_a_nested_function": """
        def outer():
            code = "IN_A_CLOSURE"

            def inner():
                return RunErrorEvent(
                    type=EventType.RUN_ERROR, message="m", code=code
                )

            return inner
    """,
    "code_set_in_a_try_body": """
        def emit(run):
            code = "BEFORE_THE_TRY"
            try:
                code = "SET_IN_THE_TRY"
                run()
            except Exception:
                return RunErrorEvent(
                    type=EventType.RUN_ERROR, message="m", code=code
                )
            return None
    """,
    "frame_after_a_break": """
        def emit(items):
            code = "BEFORE_THE_LOOP"
            for item in items:
                if item:
                    code = "SET_BEFORE_A_BREAK"
                    break
            return RunErrorEvent(type=EventType.RUN_ERROR, message="m", code=code)
    """,
    "code_from_a_classifier_that_falls_off_the_end": """
        def classify(error):
            if error:
                return "ONLY_ON_ONE_PATH"

        def emit(error):
            return RunErrorEvent(
                type=EventType.RUN_ERROR, message="m", code=classify(error)
            )
    """,
    "code_from_a_generator": """
        def classify(error):
            yield "FROM_A_GENERATOR"

        def emit(error):
            return RunErrorEvent(
                type=EventType.RUN_ERROR, message="m", code=classify(error)
            )
    """,
    "code_from_an_overloaded_name": """
        def classify(error):
            return "FIRST_DEFINITION"

        def classify(error):
            return "SECOND_DEFINITION"

        def emit(error):
            return RunErrorEvent(
                type=EventType.RUN_ERROR, message="m", code=classify(error)
            )
    """,
    "frame_through_an_attribute": """
        import ag_ui.core as core

        def emit():
            return core.RunErrorEvent(
                type=EventType.RUN_ERROR, message="m", code="THROUGH_AN_ATTRIBUTE"
            )
    """,
}


def _written(tmp_path: Path, name: str, body: str) -> Path:
    path = tmp_path / f"{name}.py"
    path.write_text(PRELUDE + textwrap.dedent(body).strip() + "\n", encoding="utf-8")
    return path


def _recognised_sites(path: Path) -> int:
    """Calls written with a marker, counted by a reading of this suite's own.

    Deliberately not the extractor's own tally of what it dispatched, and
    deliberately not its recogniser either: the two agreeing is what the
    balance below is about, and a count taken from the reader under test would
    agree with it whatever either of them does.
    """
    return len(marker_sites(path))


def _dispatched(path: Path) -> int:
    extraction = extract_source(path)
    return (
        extraction.recorded_sites
        + extraction.unresolved_sites
        + extraction.delegated_sites
    )


ADAPTER_SOURCES = [SRC_ROOT / name for name in SOURCE_FILES]
CORPUS_SOURCES = sorted(CORPUS_ROOT.glob("*.py"))


@pytest.mark.parametrize(
    "path", ADAPTER_SOURCES + CORPUS_SOURCES, ids=lambda path: path.stem
)
def test_every_recognised_site_is_recorded_or_counted(path: Path) -> None:
    assert _recognised_sites(path) == _dispatched(path), (
        f"{path.name} has terminal-frame sites extraction neither recorded nor "
        "counted, so the contract is unenforced there while the suite is green."
    )


@pytest.mark.parametrize("name", sorted(SHAPES), ids=sorted(SHAPES))
def test_an_unfamiliar_shape_is_recorded_or_counted(tmp_path: Path, name: str) -> None:
    path = _written(tmp_path, name, SHAPES[name])
    assert _recognised_sites(path) == _dispatched(path)


def test_the_balance_goes_red_when_a_site_is_dropped(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A balance nothing can redden would pin nothing.

    Neutering the one dispatch that records or counts a directly constructed
    frame is exactly the defect the balance is for, so it has to fail here.
    """
    path = _written(tmp_path, "dropped", SHAPES["code_from_a_subscript"])
    monkeypatch.setattr(
        error_code_extract._Visitor, "_record", lambda self, node, code, message: None
    )
    assert _recognised_sites(path) != _dispatched(path)


def test_a_literal_the_code_never_evaluates_to_is_not_reported(
    tmp_path: Path,
) -> None:
    """Reading a classifier's whole body reports codes it cannot return.

    The compared string is a literal in a code-shaped spelling sitting in the
    classifier, and the only codes the call can produce are the two it
    returns.
    """
    path = _written(
        tmp_path,
        "stale_literal",
        """
        def classify(error):
            if str(error) == "LEGACY_TIMEOUT":
                return "REAL_ADAPTER_BUG"
            return "REAL_STRANDS_ERROR"

        def emit(error):
            return RunErrorEvent(
                type=EventType.RUN_ERROR, message="m", code=classify(error)
            )
        """,
    )
    extraction = extract_source(path)
    assert extraction.codes == {"REAL_ADAPTER_BUG", "REAL_STRANDS_ERROR"}
    assert extraction.unresolved_sites == 0


def test_a_binding_the_site_cannot_be_carrying_is_not_reported(
    tmp_path: Path,
) -> None:
    """A literal under a resolved name is only a code if the name can hold it.

    ``FROM_A_MAPPING`` is a value in a table the site never reads, and
    ``THE_KEY`` is how it is keyed. Neither is what the frame carries, and
    what the frame does carry cannot be read, so the site is counted.
    """
    path = _written(
        tmp_path,
        "unrelated_literal",
        """
        ALIASES = {"THE_KEY": "FROM_A_MAPPING"}

        def emit(kind):
            code = ALIASES["THE_KEY"] if kind else "PLAIN_CODE"
            return RunErrorEvent(type=EventType.RUN_ERROR, message="m", code=code)
        """,
    )
    extraction = extract_source(path)
    assert extraction.messages_by_code == {}
    assert extraction.unresolved_sites == 1


# A frame validated out of a mapping carries what the mapping evaluates to,
# and a reader that stops at the first writing of a key reports a code the
# frame may never hold.


def test_a_mapping_carries_the_last_writing_of_its_key(tmp_path: Path) -> None:
    path = _written(
        tmp_path,
        "duplicate_key",
        """
        def emit():
            return RunErrorEvent.model_validate(
                {
                    "type": EventType.RUN_ERROR,
                    "message": "A duplicated-key sentence.",
                    "code": "FIRST_KEY",
                    "code": "LAST_KEY",
                }
            )
        """,
    )
    extraction = extract_source(path)
    assert extraction.messages_by_code == {"LAST_KEY": {"A duplicated-key sentence."}}
    assert extraction.unresolved_sites == 0


def test_a_mapping_a_spread_can_still_replace_is_counted(tmp_path: Path) -> None:
    """``overrides`` can carry any code, so the one written here is not read."""
    path = _written(
        tmp_path,
        "spread_over_the_code",
        """
        def emit(overrides):
            return RunErrorEvent.model_validate(
                {
                    "type": EventType.RUN_ERROR,
                    "message": "A replaceable sentence.",
                    "code": "REPLACEABLE_CODE",
                    **overrides,
                }
            )
        """,
    )
    extraction = extract_source(path)
    assert extraction.messages_by_code == {}
    assert extraction.unresolved_sites == 1


def test_a_key_written_after_a_spread_is_still_read(tmp_path: Path) -> None:
    """What the mapping writes last is what it holds, spread or not."""
    path = _written(
        tmp_path,
        "spread_before_the_code",
        """
        def emit(defaults):
            return RunErrorEvent.model_validate(
                {
                    **defaults,
                    "type": EventType.RUN_ERROR,
                    "message": "A sentence written after the spread.",
                    "code": "AFTER_THE_SPREAD",
                }
            )
        """,
    )
    extraction = extract_source(path)
    assert extraction.messages_by_code == {
        "AFTER_THE_SPREAD": {"A sentence written after the spread."}
    }
    assert extraction.unresolved_sites == 0


def test_a_binding_a_later_pass_leaves_live_is_reported(tmp_path: Path) -> None:
    """The second iteration really does emit under the code the first one set."""
    path = _written(
        tmp_path,
        "loop_rebinding",
        """
        def emit(items):
            code = "FIRST_PASS"
            for item in items:
                yield RunErrorEvent(
                    type=EventType.RUN_ERROR, message="m", code=code
                )
                code = "LATER_PASSES"
        """,
    )
    assert extract_source(path).codes == {"FIRST_PASS", "LATER_PASSES"}


def test_a_parameter_a_branch_reassigns_still_reaches_the_site(
    tmp_path: Path,
) -> None:
    """One branch's code is not the only one the frame can carry.

    Called without ``override`` the frame carries whatever the caller passed,
    which cannot be read, so the site is counted rather than recorded against
    the one code written down here.
    """
    path = _written(
        tmp_path,
        "reassigned_parameter",
        """
        def emit(code, override):
            if override:
                code = "OVERRIDE_CODE"
            return RunErrorEvent(type=EventType.RUN_ERROR, message="m", code=code)
        """,
    )
    extraction = extract_source(path)
    assert extraction.messages_by_code == {}
    assert extraction.unresolved_sites == 1


def test_a_class_body_shadows_the_module_for_the_code_written_in_it(
    tmp_path: Path,
) -> None:
    path = _written(
        tmp_path,
        "class_body_scope",
        """
        failure_code = "AT_FILE_SCOPE"

        class Reporter:
            failure_code = "IN_CLASS_BODY"
            frame = RunErrorEvent(
                type=EventType.RUN_ERROR, message="m", code=failure_code
            )
        """,
    )
    assert extract_source(path).codes == {"IN_CLASS_BODY"}


def test_a_method_reads_the_module_rather_than_its_class_body(
    tmp_path: Path,
) -> None:
    """A method does not see its class's names, so neither does resolution."""
    path = _written(
        tmp_path,
        "method_scope",
        """
        failure_code = "AT_FILE_SCOPE"

        class Reporter:
            failure_code = "IN_CLASS_BODY"

            def emit(self):
                return RunErrorEvent(
                    type=EventType.RUN_ERROR, message="m", code=failure_code
                )
        """,
    )
    assert extract_source(path).codes == {"AT_FILE_SCOPE"}


def test_a_handler_carries_what_its_try_body_had_bound(tmp_path: Path) -> None:
    """The raise lands inside the body, so a binding it made is live above."""
    path = _written(tmp_path, "try_body", SHAPES["code_set_in_a_try_body"])
    assert extract_source(path).codes == {"BEFORE_THE_TRY", "SET_IN_THE_TRY"}


# A builder's own frame is answered for at its callers, so a caller in the
# other module extraction reads has to be found there. The three cases below
# are the spellings that reach one, and each would otherwise lose the sentence
# it hands over while the frame it came from still read as delegated.

_BUILDER_MODULE = """
        def _resume_error(message):
            return RunErrorEvent(
                type=EventType.RUN_ERROR, message=message, code="CROSS_FILE"
            )
"""


def _read_set(tmp_path: Path, agent: str, endpoint: str) -> Path:
    root = tmp_path / "package"
    root.mkdir(parents=True)
    for name, body in (("agent.py", agent), ("endpoint.py", endpoint)):
        (root / name).write_text(
            PRELUDE + textwrap.dedent(body).strip() + "\n", encoding="utf-8"
        )
    return root


def test_a_builder_called_from_the_other_module_is_read_at_that_call(
    tmp_path: Path,
) -> None:
    root = _read_set(
        tmp_path,
        _BUILDER_MODULE
        + """
        def emit():
            return _resume_error("The sentence written in the agent.")
        """,
        """
        from .agent import _resume_error

        def handle():
            return _resume_error("The sentence written in the endpoint.")
        """,
    )
    extraction = error_code_extract.extract(root)
    assert extraction.messages_by_code == {
        "CROSS_FILE": {
            "The sentence written in the agent.",
            "The sentence written in the endpoint.",
        }
    }
    assert extraction.delegated_sites == 1
    assert extraction.unresolved_sites == 0


def test_a_builder_whose_only_caller_is_the_other_module_is_still_delegated(
    tmp_path: Path,
) -> None:
    """Nothing calls it where it is written, so nothing there pins its text."""
    root = _read_set(
        tmp_path,
        _BUILDER_MODULE,
        """
        from .agent import _resume_error as build_error

        def handle():
            return build_error("The sentence written in the endpoint.")
        """,
    )
    extraction = error_code_extract.extract(root)
    assert extraction.messages_by_code == {
        "CROSS_FILE": {"The sentence written in the endpoint."}
    }
    assert extraction.delegated_sites == 1


def test_a_builder_reached_through_the_module_holding_it_is_read(
    tmp_path: Path,
) -> None:
    root = _read_set(
        tmp_path,
        _BUILDER_MODULE,
        """
        from . import agent

        def handle():
            return agent._resume_error("The sentence written in the endpoint.")
        """,
    )
    extraction = error_code_extract.extract(root)
    assert extraction.messages_by_code == {
        "CROSS_FILE": {"The sentence written in the endpoint."}
    }


def test_a_builder_imported_by_the_package_path_is_read_at_that_call(
    tmp_path: Path,
) -> None:
    """A sibling named absolutely is still the sibling."""
    root = _read_set(
        tmp_path,
        _BUILDER_MODULE,
        """
        from package.agent import _resume_error

        def handle():
            return _resume_error("The sentence written in the endpoint.")
        """,
    )
    extraction = error_code_extract.extract(root)
    assert extraction.messages_by_code == {
        "CROSS_FILE": {"The sentence written in the endpoint."}
    }


# What is written ahead of a builder's name has to be the module holding it,
# and each of these is a way of writing something else there. A sentence any
# of them carried onto the contract would be one the adapter never writes.
_NOT_THE_MODULE: dict[str, str] = {
    "nothing binds the name": """
        def handle(agent):
            return agent._resume_error("Not this adapter's sentence.")
    """,
    "the import binds another name": """
        import package.agent

        def handle(agent):
            return agent._resume_error("Not this adapter's sentence.")
    """,
    "a parameter stands in front of the module": """
        from . import agent

        def handle(agent):
            return agent._resume_error("Not this adapter's sentence.")
    """,
    "a local stands in front of the module": """
        from . import agent

        def handle(other):
            agent = other
            return agent._resume_error("Not this adapter's sentence.")
    """,
}


@pytest.mark.parametrize(
    "endpoint", sorted(_NOT_THE_MODULE), ids=sorted(_NOT_THE_MODULE)
)
def test_a_name_that_is_not_the_module_carries_no_sentence(
    tmp_path: Path, endpoint: str
) -> None:
    root = _read_set(
        tmp_path,
        _BUILDER_MODULE
        + """
        def emit():
            return _resume_error("The sentence written in the agent.")
        """,
        _NOT_THE_MODULE[endpoint],
    )
    extraction = error_code_extract.extract(root)
    assert extraction.messages_by_code == {
        "CROSS_FILE": {"The sentence written in the agent."}
    }


def test_a_dotted_module_path_answers_for_no_builder(tmp_path: Path) -> None:
    """Both halves of delegation read a call the same way.

    A recorder that took ``package.agent._resume_error(...)`` for a caller
    while the reading that follows a call to a builder could not resolve it
    would mark the builder's own frame answered for at a call whose sentence
    nothing ever reads. Neither reads it, so the frame is recorded where it is
    written and the sentence it carries stays visibly unpinned.
    """
    root = _read_set(
        tmp_path,
        _BUILDER_MODULE,
        """
        import package.agent

        def handle():
            return package.agent._resume_error("Reached by a dotted path.")
        """,
    )
    extraction = error_code_extract.extract(root)
    assert extraction.messages_by_code == {"CROSS_FILE": {"{}"}}
    assert extraction.delegated_sites == 0


def test_a_third_party_module_of_the_same_name_carries_no_sentence(
    tmp_path: Path,
) -> None:
    """``strands.agent`` is not ``.agent``, however the two paths end.

    Matching on the last path component alone would hand this library's
    sentence to the contract, and its call would answer for our builder's own
    frame as well, leaving the only recorded text foreign.
    """
    foreign = """
        from strands.agent import _resume_error

        def handle():
            return _resume_error("A sentence from the strands library.")
    """
    alone = error_code_extract.extract(
        _read_set(tmp_path / "a", _BUILDER_MODULE, foreign)
    )
    assert alone.messages_by_code == {"CROSS_FILE": {"{}"}}
    assert alone.delegated_sites == 0

    beside_ours = error_code_extract.extract(
        _read_set(
            tmp_path / "b",
            _BUILDER_MODULE
            + """
        def emit():
            return _resume_error("The sentence written in the agent.")
        """,
            foreign,
        )
    )
    assert beside_ours.messages_by_code == {
        "CROSS_FILE": {"The sentence written in the agent."}
    }


def test_a_module_that_only_calls_a_builder_is_named_as_emitting(
    tmp_path: Path,
) -> None:
    """It writes no frame of its own, so nothing else would give it away."""
    root = _read_set(
        tmp_path,
        _BUILDER_MODULE
        + """
        def emit():
            return _resume_error("The sentence written in the agent.")
        """,
        "",
    )
    (root / "relay.py").write_text(
        textwrap.dedent(
            """
            from .agent import _resume_error

            def handle():
                return _resume_error("A sentence from an unlisted module.")
            """
        ).strip()
        + "\n",
        encoding="utf-8",
    )
    assert "relay.py" in error_code_extract.emitting_files(root)
