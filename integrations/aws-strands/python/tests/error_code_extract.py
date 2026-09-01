"""Static extraction of the RUN_ERROR codes and message texts this adapter emits.

The terminal error codes and their message strings are a wire contract:
clients and mock harnesses match both literally. Deriving the set from the
source rather than from a hand-maintained list inside the package is what
turns a divergence from the TypeScript sibling into a test failure at the
moment it is introduced.

Extraction is syntactic, and the rule it and its TypeScript sibling both
follow is this: a site counts as a terminal-error construction when the marker
it is written with is recognised, which means the ``RunErrorEvent``
constructor, the ``_error_events`` helper, or a local alias of either on this
side, however that name is reached: called on its own, through the module
holding it, or through one of its own class methods. The TypeScript side
recognises an object literal typed ``RUN_ERROR`` or the ``_runError`` helper.
Every recognised site is then either recorded against the codes its code
expression can evaluate to there, or counted as unresolved. Counting covers
every reason a code can fail to resolve, whether it is a parameter, computed,
keyed in a way that cannot be read, or absent altogether, so a new way of
emitting one cannot slip past unreviewed.

Resolution is deliberately narrow, because a code read off the wrong evidence
is worse than one not read at all: it reports a contract the adapter does not
keep while the suite stays green. Three shapes resolve, each only to what it
evaluates to where it is written: a literal, a name read off the bindings that
can still hold there, and a call read off what its function returns. A literal
elsewhere in the same subtree, or under the same name on a path that cannot
reach the site, is evidence of nothing.

``../../error-code-corpus`` holds one tiny synthetic source per shape either
language can write a frame in, and the corpus suite on each side asserts what
that side reads out of it, so a shape one extractor sees and the other does
not fails rather than drifting.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field
from pathlib import Path

SRC_ROOT = Path(__file__).resolve().parents[1] / "src" / "ag_ui_strands"

# Modules that construct terminal error frames. Listing them beats globbing:
# a new emitting module becomes a reviewed edit here rather than a silent one.
# ``emitting_files`` below is what keeps the list honest.
SOURCE_FILES = ("agent.py", "endpoint.py")

# The constructor and the helper a terminal frame is built with. Aliases of
# either are followed, so renaming one at the import or the binding does not
# take its sites out of the count.
EVENT_NAME = "RunErrorEvent"
HELPER_NAME = "_error_events"

# Codes are screaming snake case. Underscores are optional so a single-token
# code is recorded under its own name rather than counted as unresolved; a
# string that only looks like one still has to be what a code expression
# evaluates to, and every way of getting that wrong fails the parity
# assertions out loud.
_CODE_LITERAL = re.compile(r"^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$")

# Placeholder standing in for any interpolated value, so a template can be
# compared against the TypeScript sibling's without either language's
# interpolation syntax leaking into the comparison.
PLACEHOLDER = "{}"

# What a frame carrying no message at all renders as. A frame whose message is
# computed renders as PLACEHOLDER, and one with no message is a different fault
# entirely, so the two must not answer for each other.
MISSING_MESSAGE = "<no message>"

# Nodes that own the names bound inside them. Collection for one scope stops at
# the next one down, so a name bound in a nested function never answers for a
# use in the function around it.
_SCOPE_NODES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)

# Statements that end the block they sit in, so a binding made before one of
# them does not simply fall through to what follows. Where a ``break`` or a
# ``continue`` arrives instead is the loop's business, and _scan_loop's.
_TERMINATORS = (ast.Return, ast.Raise, ast.Break, ast.Continue)

_LOOP_NODES = (ast.While, ast.For, ast.AsyncFor)

_TRY_NODES: tuple[type, ...] = (ast.Try,) + (
    (ast.TryStar,) if hasattr(ast, "TryStar") else ()
)

# ``str.format`` fields and percent conversions, so a sentence built with
# either renders the template a TypeScript template literal renders.
_FORMAT_FIELD = re.compile(r"\{\{|\}\}|\{[^{}]*\}")
_PERCENT_FIELD = re.compile(
    r"%(?:\([^)]*\))?[-+ #0]*(?:\*|\d+)?(?:\.(?:\*|\d+))?[hlL]?[diouxXeEfFgGcrsa%]"
)


@dataclass(frozen=True)
class Site:
    """One recognised construction site, and which track answered for it.

    Every site is listed, resolved or not, so that a site being read at all can
    be asserted from outside rather than inferred from the codes that came out.
    """

    file: str
    line: int
    column: int
    resolved: bool


@dataclass
class Extraction:
    """Codes and normalised message templates found in one source tree.

    The three site counts make the recorded-or-counted rule checkable rather
    than merely stated: the soundness suite counts recognised sites for itself
    and holds the three to that total. ``sites`` says where each one was, so
    the accounting suite can ask which particular markers were answered for
    rather than only how many.
    """

    messages_by_code: dict[str, set[str]] = field(default_factory=dict)
    unresolved_sites: int = 0
    recorded_sites: int = 0
    delegated_sites: int = 0
    sites: list[Site] = field(default_factory=list)

    @property
    def codes(self) -> set[str]:
        return set(self.messages_by_code)

    def record(self, code: str, message: str) -> None:
        self.messages_by_code.setdefault(code, set()).add(message)


def _render_message(node: ast.AST | None) -> list[str]:
    """Message templates a node can produce, one per branch it can take.

    The text around the placeholders is exactly what the literal holds. Neither
    language pads a sentence for being written over several source lines, so
    every space and newline in a rendered template is one the wire carries, and
    normalising them away would hide both a reword that only moves whitespace
    and a bridge that wraps a shared sentence differently from its sibling.
    """
    if node is None:
        return [MISSING_MESSAGE]
    if isinstance(node, ast.IfExp):
        return _render_message(node.body) + _render_message(node.orelse)
    # ``computed or "fallback"`` reaches the wire as either operand, and the
    # fallback is usually the only sentence written down anywhere.
    if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
        return [text for value in node.values for text in _render_message(value)]
    text = _render_literal(node)
    return [PLACEHOLDER if text is None else text]


def _format_placeholders(text: str) -> str:
    """``str.format`` fields as PLACEHOLDER, doubled braces back to one."""

    def replace(match: re.Match[str]) -> str:
        found = match.group(0)
        if found == "{{":
            return "{"
        if found == "}}":
            return "}"
        return PLACEHOLDER

    return _FORMAT_FIELD.sub(replace, text)


def _percent_placeholders(text: str) -> str:
    return _PERCENT_FIELD.sub(
        lambda match: "%" if match.group(0).endswith("%") else PLACEHOLDER, text
    )


def _render_literal(node: ast.AST) -> str | None:
    """Literal text of a string expression, or ``None`` when it is not one.

    An interpolation is a sentence with a hole in it however it is spelled, so
    ``format`` and ``%`` render the text around their fields the way an
    f-string does, and the way a TypeScript template literal does.
    """
    if isinstance(node, ast.Constant):
        return node.value if isinstance(node.value, str) else None
    if isinstance(node, ast.JoinedStr):
        parts: list[str] = []
        for value in node.values:
            if isinstance(value, ast.FormattedValue):
                parts.append(PLACEHOLDER)
                continue
            rendered = _render_literal(value)
            if rendered is None:
                return None
            parts.append(rendered)
        return "".join(parts)
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Attribute) and node.func.attr == "format":
            base = _render_literal(node.func.value)
            return None if base is None else _format_placeholders(base)
        return None
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mod):
        left = _render_literal(node.left)
        return None if left is None else _percent_placeholders(left)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = _render_literal(node.left)
        right = _render_literal(node.right)
        # A concatenation stays a template as long as one side is literal: the
        # non-literal side is an interpolated value like any other. An empty
        # literal side is still a literal side, and contributes nothing.
        if left is None and right is None:
            return None
        return (PLACEHOLDER if left is None else left) + (
            PLACEHOLDER if right is None else right
        )
    return None


def _referenced_name(node: ast.AST | None) -> str | None:
    """Trailing name of a bare or dotted reference."""
    if node is None:
        return None
    return getattr(node, "id", None) or getattr(node, "attr", None)


def _called_name(node: ast.Call) -> str | None:
    """Name of a call written as a bare name, rather than reached through one."""
    return node.func.id if isinstance(node.func, ast.Name) else None


def _qualified_callee(node: ast.Call) -> tuple[str, str] | None:
    """The qualifier and member of a call written as ``qualifier.member(...)``.

    One reading for both halves of cross-file delegation: the one that finds a
    builder's callers, and the one that follows a call to a builder. Answering
    for a builder from a spelling the second half cannot follow would leave the
    sentences it carries unpinned while its own frame still read as delegated.
    A longer dotted chain names no module in the read set, so it is neither.
    """
    func = node.func
    if not isinstance(func, ast.Attribute) or not isinstance(func.value, ast.Name):
        return None
    return func.value.id, func.attr


def _callee_names(node: ast.AST) -> list[str]:
    """Every name in a call's callee, the base one first.

    A frame is built through a marker in three shapes: the marker called on its
    own, the marker reached through the module holding it, and one of the
    marker's own class methods called on it. ``model_construct`` and
    ``model_validate`` are the third, and both are already idioms in this
    package, so reading only the trailing name would leave a frame built with
    either recognised as no frame at all.
    """
    found: list[str] = []
    current: ast.AST | None = node
    while isinstance(current, ast.Attribute):
        found.append(current.attr)
        current = current.value
    if isinstance(current, ast.Name):
        found.append(current.id)
    return list(reversed(found))


def _marker_name(node: ast.AST, names: set[str]) -> str | None:
    """The marker a callee is written with, or ``None`` when it names none."""
    for name in _callee_names(node):
        if name in names:
            return name
    return None


class _Unreadable:
    """A mapping entry something written after it can still replace."""


UNREADABLE = _Unreadable()


def _mapping_value(node: ast.Dict, name: str) -> ast.AST | _Unreadable | None:
    """A dict literal's value under a string key, as Python evaluates the literal.

    A later entry replaces an earlier one, so the last writing of the key is
    what the mapping holds. A ``**`` spread or a computed key standing after it
    can carry that key with anything in it, and a frame read off the rest would
    report a code the site may never carry, so the entry reads as unreadable
    and its site is counted instead.
    """
    found: ast.AST | _Unreadable | None = None
    for key, value in zip(node.keys, node.values):
        if key is None or not isinstance(key, ast.Constant):
            found = UNREADABLE
        elif key.value == name:
            found = value
    return found


def _position(node: ast.AST) -> tuple[int, int]:
    return (getattr(node, "lineno", 0), getattr(node, "col_offset", 0))


def _contains(node: ast.AST, position: tuple[int, int]) -> bool:
    end_line = getattr(node, "end_lineno", None)
    end_column = getattr(node, "end_col_offset", None)
    if end_line is None or end_column is None:
        return False
    return _position(node) <= position <= (end_line, end_column)


@dataclass(frozen=True)
class _Bind:
    """One way a name is bound, and the expression it is bound to.

    ``value`` is unset when the bound expression is not written here: an
    unpacking, a loop target, a parameter, an import. Such a binding resolves
    to nothing, leaving the site reading the name unresolved rather than read
    off something the name never holds.
    """

    node: ast.AST
    value: ast.AST | None


def _stores(node: ast.AST, name: str) -> bool:
    """Whether a node is ``name`` written into rather than read."""
    return (
        isinstance(node, ast.Name)
        and isinstance(node.ctx, ast.Store)
        and node.id == name
    )


def _assigned(node: ast.AST, name: str) -> _Bind | None:
    """The binding an assignment makes to ``name``, if it makes one.

    A name assigned on its own is bound to the expression written there; one
    reached through an unpacking is bound to a part of one, which is not an
    expression, and so to nothing readable.
    """
    if not isinstance(node, (ast.Assign, ast.AnnAssign, ast.NamedExpr)):
        return None
    if node.value is None:
        return None
    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
    if any(isinstance(one, ast.Name) and one.id == name for one in targets):
        return _Bind(node, node.value)
    if any(_stores(inner, name) for one in targets for inner in ast.walk(one)):
        return _Bind(node, None)
    return None


def _names_itself(node: ast.AST, name: str) -> bool:
    """Whether a node binds ``name`` in a string field rather than in a target.

    ``except E as name``, an import alias, a ``def`` or ``class``, a ``global``
    and a match capture all spell what they bind this way, so no store-context
    name node stands for them.
    """
    if isinstance(node, ast.alias):
        return (node.asname or node.name.split(".")[0]) == name
    if isinstance(node, (ast.Global, ast.Nonlocal)):
        return name in node.names
    return name in (getattr(node, "name", None), getattr(node, "rest", None))


def _branch_bodies(node: ast.AST) -> tuple[list[list[ast.stmt]], list[ast.stmt]]:
    """Bodies a statement owns but does not run in sequence, and what follows.

    An empty body stands for the path that skips the branches, which is how a
    binding made before an ``if`` with no ``else`` survives it.
    """
    if isinstance(node, ast.If):
        return [node.body, node.orelse], []
    if isinstance(node, _LOOP_NODES):
        return [node.body, node.orelse], []
    if isinstance(node, (ast.With, ast.AsyncWith)):
        return [node.body], []
    if isinstance(node, _TRY_NODES):
        bodies = [[*node.body, *node.orelse]]
        bodies.extend(handler.body for handler in node.handlers)
        return bodies, list(node.finalbody)
    if isinstance(node, ast.Match):
        return [list(case.body) for case in node.cases] + [[]], []
    return [], []


def _always_ends(statements: list[ast.stmt]) -> bool:
    """Whether every path through a block leaves it rather than running past it.

    A loop never counts, because a loop that runs no iterations falls straight
    through, and neither does a ``match`` with no matching case.
    """
    for statement in statements:
        if isinstance(statement, _TERMINATORS):
            return True
        if isinstance(statement, _LOOP_NODES):
            continue
        branches, trailing = _branch_bodies(statement)
        if trailing and _always_ends(trailing):
            return True
        if branches and all(_always_ends(body) for body in branches):
            return True
    return False


def _own_bindings(statement: ast.AST, name: str) -> list[_Bind]:
    """Bindings of ``name`` a statement makes itself, its branches excluded.

    Anything that puts the name in scope counts, not assignment alone: a
    binding the scan cannot see is answered from an older one or from an outer
    scope, which is the wrong-value reading this file exists to prevent.
    """
    branches, trailing = _branch_bodies(statement)
    nested = {id(node) for body in (*branches, trailing) for node in body}
    found: list[_Bind] = []

    def walk(node: ast.AST) -> None:
        if id(node) in nested:
            return
        assigned = _assigned(node, name)
        if assigned is not None:
            # Its targets are this binding. Walking them would read the name
            # being written as a second, valueless binding of itself.
            found.append(assigned)
            walk(node.value)
            return
        if _stores(node, name) or _names_itself(node, name):
            found.append(_Bind(node, None))
        # A nested scope owns the names bound inside it. Its ``def`` still
        # binds the name it is written under, which is why the checks above
        # come first.
        if isinstance(node, _SCOPE_NODES):
            return
        for child in ast.iter_child_nodes(node):
            # A comprehension's loop variable belongs to the comprehension.
            if isinstance(node, ast.comprehension) and child is node.target:
                continue
            walk(child)

    walk(statement)
    return found


def _parameters(function: ast.AST) -> list[ast.arg]:
    """Every parameter of a function, whichever way it can be passed."""
    if not isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
        return []
    taken = function.args
    return [
        argument
        for argument in (
            *taken.posonlyargs,
            *taken.args,
            *taken.kwonlyargs,
            taken.vararg,
            taken.kwarg,
        )
        if argument is not None
    ]


@dataclass
class _LiveScan:
    """One search for the bindings of a name that can hold at a position.

    ``broken`` and ``continued`` carry one entry per enclosing loop. A path
    that ends in ``break`` or ``continue`` does not stop there the way a
    ``return`` does: it arrives after the loop, or back at its head, and the
    bindings it is carrying arrive with it.
    """

    name: str
    use: tuple[int, int]
    at_use: list[_Bind] = field(default_factory=list)
    broken: list[list[_Bind]] = field(default_factory=list)
    continued: list[list[_Bind]] = field(default_factory=list)


def _dedup(binds: list[_Bind]) -> list[_Bind]:
    seen: set[int] = set()
    found: list[_Bind] = []
    for bind in binds:
        if id(bind.node) not in seen:
            seen.add(id(bind.node))
            found.append(bind)
    return found


def _covered(binds: list[_Bind], by: list[_Bind]) -> bool:
    return {id(bind.node) for bind in binds} <= {id(bind.node) for bind in by}


def _merge_paths(
    paths: list[tuple[list[ast.stmt], list[_Bind]]], scan: _LiveScan
) -> tuple[list[_Bind], bool]:
    """Bindings live after a set of alternative bodies, and whether all ended."""
    merged: list[_Bind] = []
    ended = True
    for body, live in paths:
        out, branch_ended = _scan_block(body, live, scan)
        if branch_ended:
            continue
        ended = False
        merged.extend(out)
    return _dedup(merged), ended


def _all_bindings(statements: list[ast.stmt], name: str) -> list[_Bind]:
    """Every binding of ``name`` written anywhere in a block."""
    found: list[_Bind] = []
    for statement in statements:
        found.extend(_own_bindings(statement, name))
        branches, trailing = _branch_bodies(statement)
        for body in (*branches, trailing):
            found.extend(_all_bindings(body, name))
    return found


def _scan_try(
    statement: ast.AST, live: list[_Bind], scan: _LiveScan
) -> tuple[list[_Bind], bool]:
    """Bindings live after a try, its handlers reached from inside the body.

    An exception is raised at some point in the body, not before it, so a
    handler runs carrying whatever the body had bound by then. Which point
    cannot be known, so any binding the body makes can be the one it finds.
    """
    caught = _dedup([*live, *_all_bindings(statement.body, scan.name)])
    paths = [([*statement.body, *statement.orelse], live)]
    paths.extend((handler.body, caught) for handler in statement.handlers)
    return _merge_paths(paths, scan)


def _scan_loop(statement: ast.AST, live: list[_Bind], scan: _LiveScan) -> list[_Bind]:
    """Bindings live after a loop.

    The body is rescanned until what arrives at the head stops growing,
    because a binding one iteration makes is live for the next one and for
    every use written above it. What leaves is what reaches the head, plus
    what any ``break`` was carrying.
    """
    scan.broken.append([])
    scan.continued.append([])
    head = live
    while True:
        out, ended = _scan_block(statement.body, head, scan)
        arriving = _dedup([*head, *([] if ended else out), *scan.continued[-1]])
        if _covered(arriving, head):
            break
        head = arriving
    scan.continued.pop()
    broken = scan.broken.pop()
    through, else_ended = _scan_block(statement.orelse, head, scan)
    return _dedup([*([] if else_ended else through), *broken])


def _scan_block(
    statements: list[ast.stmt], live: list[_Bind], scan: _LiveScan
) -> tuple[list[_Bind], bool]:
    """Bindings live after a block, and whether every path through it ended.

    What is live where the use is written is collected on every pass that
    reaches it, not on the first alone, so a rescanned loop body contributes
    the bindings a later iteration carries as well as a first one's.
    """
    for statement in statements:
        branches, trailing = _branch_bodies(statement)
        inner = [node for body in (*branches, trailing) for node in body]
        if _contains(statement, scan.use) and not any(
            _contains(node, scan.use) for node in inner
        ):
            scan.at_use.extend(live)
        own = _own_bindings(statement, scan.name)
        if own:
            live = own
        ended = False
        if isinstance(statement, _LOOP_NODES):
            live = _scan_loop(statement, live, scan)
        elif isinstance(statement, _TRY_NODES):
            live, ended = _scan_try(statement, live, scan)
        elif branches:
            live, ended = _merge_paths([(body, live) for body in branches], scan)
        if trailing:
            live, ended_trailing = _scan_block(trailing, live, scan)
            ended = ended or ended_trailing
        if isinstance(statement, ast.Break) and scan.broken:
            scan.broken[-1].extend(live)
        if isinstance(statement, ast.Continue) and scan.continued:
            scan.continued[-1].extend(live)
        if ended or isinstance(statement, _TERMINATORS):
            return live, True
    return live, False


def _live_bindings(scope: ast.AST, name: str, use: tuple[int, int]) -> list[_Bind]:
    """Bindings of ``name`` in ``scope`` that can still hold at ``use``.

    Every binding a path to the use can be carrying is collected, not only the
    nearest one: a default that one branch overwrites is still a code the
    adapter emits. A binding a later unconditional one overwrites, and one on
    a branch that leaves before the use, cannot arrive and stay out. A
    parameter is seeded as a binding of its own, so a name a branch reassigns
    still answers with the argument the other path leaves in place. Nested
    scopes are not descended into.
    """
    body = getattr(scope, "body", None)
    if not isinstance(body, list):
        return []
    seed = [
        _Bind(argument, None) for argument in _parameters(scope) if argument.arg == name
    ]
    scan = _LiveScan(name=name, use=use)
    _scan_block(body, seed, scan)
    return _dedup(scan.at_use)


def _own_nodes(function: ast.AST) -> list[ast.AST]:
    """Nodes belonging to a function's own body, nested scopes not descended into."""
    found: list[ast.AST] = []

    def walk(node: ast.AST) -> None:
        for child in ast.iter_child_nodes(node):
            found.append(child)
            if not isinstance(child, _SCOPE_NODES):
                walk(child)

    walk(function)
    return found


def _returned_values(function: ast.FunctionDef) -> list[ast.AST] | None:
    """Expressions the function returns, or ``None`` when a call is not one of them.

    A decorator can return anything, a generator returns a generator, and a
    bare ``return`` or a path running off the end returns ``None``. In each
    the call is not one of the expressions written here, so it resolves to
    nothing rather than to the literals lying around in the body.
    """
    if function.decorator_list:
        return None
    own = _own_nodes(function)
    if any(isinstance(node, (ast.Yield, ast.YieldFrom)) for node in own):
        return None
    returns = [node for node in own if isinstance(node, ast.Return)]
    if any(node.value is None for node in returns):
        return None
    if not _always_ends(function.body):
        return None
    return [node.value for node in returns]


def _resolve_call(
    node: ast.Call, scopes: list[ast.AST], seen: frozenset[int]
) -> list[str] | None:
    """Codes a call to a plain module-level function can return.

    The ``ADAPTER_BUG`` / ``STRANDS_ERROR`` split lives in one function rather
    than at each emission site, so the codes sit one call away from the frame
    carrying them. Only a bare-name call to a single ``def`` at the top level
    of the same module is followed, and only through what it returns.
    """
    module = scopes[0]
    name = _called_name(node)
    if name is None or not isinstance(module, ast.Module):
        return None
    definitions = [
        statement
        for statement in module.body
        if isinstance(statement, ast.FunctionDef) and statement.name == name
    ]
    if len(definitions) != 1:
        return None
    function = definitions[0]
    values = _returned_values(function)
    if not values:
        return None
    found: list[str] = []
    for value in values:
        codes = _resolve_code(value, [module, function], seen)
        if not codes:
            return None
        found.extend(codes)
    return found


def _lookup_chain(scopes: list[ast.AST]) -> list[ast.AST]:
    """The scopes a name written in the innermost one is looked up through.

    A class body is in scope for the code written directly in it and for
    nothing nested inside it, because a method does not see its class's names.
    """
    return [
        scope
        for index, scope in enumerate(scopes)
        if index == len(scopes) - 1 or not isinstance(scope, ast.ClassDef)
    ]


def _resolve_code(
    node: ast.AST | None,
    scopes: list[ast.AST],
    seen: frozenset[int] = frozenset(),
) -> list[str] | None:
    """Code strings a node can evaluate to where it is written, or ``None``.

    ``None`` whenever that cannot be shown, and every caller turns it into a
    counted site rather than into nothing. A name whose live bindings include
    one resolving to nothing leaves the whole site unresolved, never half read.
    """
    if node is None or id(node) in seen:
        return None
    seen = seen | {id(node)}
    if isinstance(node, ast.Constant):
        if isinstance(node.value, str) and _CODE_LITERAL.match(node.value):
            return [node.value]
        return None
    if isinstance(node, ast.Call):
        return _resolve_call(node, scopes, seen)
    if not isinstance(node, ast.Name):
        return None
    use = _position(node)
    for scope in reversed(_lookup_chain(scopes)):
        live = _live_bindings(scope, node.id, use)
        if not live:
            continue
        found: list[str] = []
        for bind in live:
            codes = _resolve_code(bind.value, scopes, seen)
            if not codes:
                return None
            found.extend(codes)
        return found
    return None


def _alias_names(module: ast.Module, canonical: str) -> set[str]:
    """Names in this module that stand for ``canonical``."""
    names = {canonical}
    changed = True
    while changed:
        changed = False
        for node in ast.walk(module):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                for alias in node.names:
                    imported = alias.name.rsplit(".", 1)[-1]
                    if alias.asname and imported in names and alias.asname not in names:
                        names.add(alias.asname)
                        changed = True
                continue
            if not isinstance(node, (ast.Assign, ast.AnnAssign, ast.NamedExpr)):
                continue
            if node.value is None or _referenced_name(node.value) not in names:
                continue
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name) and target.id not in names:
                    names.add(target.id)
                    changed = True
    return names


def _called_names(module: ast.Module) -> set[str]:
    """Names this module calls as bare names."""
    found = {
        _called_name(node)
        for node in ast.walk(module)
        if isinstance(node, ast.Call)
    }
    return {name for name in found if name is not None}


def _scoped_calls(module: ast.Module) -> list[tuple[ast.Call, list[ast.AST]]]:
    """Every call written in a module, with the scopes it is written inside."""
    found: list[tuple[ast.Call, list[ast.AST]]] = []

    def walk(node: ast.AST, scopes: list[ast.AST]) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.Call):
                found.append((child, scopes))
            inner = [*scopes, child] if isinstance(child, _SCOPE_NODES) else scopes
            walk(child, inner)

    walk(module, [module])
    return found


def _names_bound_in(statements: list[ast.stmt]) -> set[str]:
    """Every name a block binds, however it spells the binding.

    Nested scopes own what they bind, so the walk stops at one, having taken
    the name the scope itself is written under.
    """
    found: set[str] = set()

    def walk(node: ast.AST) -> None:
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            found.add(node.id)
        elif isinstance(node, ast.alias):
            found.add(node.asname or node.name.split(".")[0])
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            found.update(node.names)
        else:
            for field in ("name", "rest"):
                bound = getattr(node, field, None)
                if isinstance(bound, str):
                    found.add(bound)
        if isinstance(node, _SCOPE_NODES):
            return
        for child in ast.iter_child_nodes(node):
            walk(child)

    for statement in statements:
        walk(statement)
    return found


def _scope_bindings(scope: ast.AST, cache: dict[int, set[str]]) -> set[str]:
    """Names a scope binds anywhere in itself, its parameters included."""
    found = cache.get(id(scope))
    if found is None:
        body = getattr(scope, "body", None)
        found = {argument.arg for argument in _parameters(scope)}
        found |= _names_bound_in(body if isinstance(body, list) else [])
        cache[id(scope)] = found
    return found


def _shadowed(name: str, scopes: list[ast.AST], cache: dict[int, set[str]]) -> bool:
    """Whether a scope inside the module binds ``name`` for itself.

    An import binds a module name at module scope; a parameter or a local of
    that name stands in front of it. Anywhere in the scope counts rather than
    only where the binding can reach, because a qualifier this drops takes a
    builder's sentence off the contract loudly, where one it keeps in error
    puts a sentence on the contract the adapter never writes.
    """
    return any(
        name in _scope_bindings(scope, cache) for scope in _lookup_chain(scopes)[1:]
    )


def _attribute_calls(module: ast.Module) -> dict[str, set[str]]:
    """Names called through a qualifier, keyed by the qualifier next to them."""
    found: dict[str, set[str]] = {}
    cache: dict[int, set[str]] = {}
    for node, scopes in _scoped_calls(module):
        qualified = _qualified_callee(node)
        if qualified is None:
            continue
        qualifier, member = qualified
        if _shadowed(qualifier, scopes, cache):
            continue
        found.setdefault(qualifier, set()).add(member)
    return found


@dataclass(frozen=True)
class _Origin:
    """A module an import names, as its dotted path and how it was written."""

    path: str
    relative: bool


def _reads(origin: _Origin, package: str) -> str | None:
    """The read-set module an import names, or ``None`` when it names none.

    A sibling is reached by a relative import or by an absolute path inside
    this package. Matching on the last path component alone would hand every
    third-party module ending in one of ours the sentences of ours, which is
    one import away in a bridge already importing ``strands.session``.
    """
    if origin.relative:
        return origin.path if origin.path and "." not in origin.path else None
    prefix = f"{package}."
    if not package or not origin.path.startswith(prefix):
        return None
    rest = origin.path[len(prefix) :]
    return rest if "." not in rest else None


def _imported_names(module: ast.Module) -> dict[str, tuple[_Origin, str]]:
    """Names taken from another module, as local name to origin and original."""
    found: dict[str, tuple[_Origin, str]] = {}
    for node in ast.walk(module):
        if not isinstance(node, ast.ImportFrom) or node.module is None:
            continue
        origin = _Origin(node.module, node.level == 1)
        for alias in node.names:
            found[alias.asname or alias.name] = (origin, alias.name)
    return found


def _namespace_aliases(module: ast.Module) -> dict[str, _Origin]:
    """Names an import binds to a module, as local name to that module.

    Only what the statement really binds: ``import a.b`` binds ``a``, so
    reading ``b`` off it would make every local of that name the module. The
    caller keeps the entries naming the module it asks about, so a member
    imported from that module is not mistaken for the module itself.
    """
    found: dict[str, _Origin] = {}
    for node in ast.walk(module):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.asname:
                    found[alias.asname] = _Origin(alias.name, False)
                else:
                    root = alias.name.split(".")[0]
                    found[root] = _Origin(root, False)
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                path = (
                    alias.name
                    if node.module is None
                    else f"{node.module}.{alias.name}"
                )
                found[alias.asname or alias.name] = _Origin(path, node.level == 1)
    return found


def _parameter_names(
    function: ast.FunctionDef | ast.AsyncFunctionDef,
) -> tuple[list[str], int]:
    """Parameter names in call order, and how many can be passed by position.

    Keyword-only parameters are named too: a builder that takes its sentence by
    keyword pins that sentence exactly as a positional one does.
    """
    positional = [
        argument.arg for argument in (*function.args.posonlyargs, *function.args.args)
    ]
    keyword_only = [argument.arg for argument in function.args.kwonlyargs]
    return positional + keyword_only, len(positional)


def _parameter_slot(
    node: ast.AST | None, parameters: list[str], positional: int
) -> tuple[int | None, str | None]:
    """Where a bare parameter reference sits in its own function's signature."""
    if not isinstance(node, ast.Name) or node.id not in parameters:
        return None, None
    index = parameters.index(node.id)
    return (index if index < positional else None), node.id


def _argument_at(
    node: ast.Call,
    keywords: dict[str, ast.AST],
    index: int | None,
    parameter: str | None,
) -> ast.AST | None:
    if parameter is not None and parameter in keywords:
        return keywords[parameter]
    if index is not None and len(node.args) > index:
        return node.args[index]
    return None


def _unpacked_indices(
    node: ast.AST, code_name: str, message_name: str
) -> tuple[int, int] | None:
    """Where two names sit in the tuple target that binds them together."""
    if isinstance(node, ast.Assign):
        targets: list[ast.AST | None] = list(node.targets)
    elif isinstance(node, (ast.AnnAssign, ast.NamedExpr)):
        targets = [node.target]
    else:
        return None
    for target in targets:
        if not isinstance(target, ast.Tuple):
            continue
        names = [
            element.id if isinstance(element, ast.Name) else None
            for element in target.elts
        ]
        if code_name in names and message_name in names:
            return names.index(code_name), names.index(message_name)
    return None


@dataclass(frozen=True)
class _Builder:
    """A single-purpose builder and the fixed code its callers emit."""

    code: str
    parameter: str
    index: int | None
    site: ast.AST


@dataclass(frozen=True)
class _HelperSignature:
    """Where a helper's own definition puts its code and message parameters."""

    code_index: int | None
    code_parameter: str | None
    message_index: int | None
    message_parameter: str | None


@dataclass(frozen=True)
class _Foreign:
    """What the other modules in the read set contribute to one module.

    ``builders`` and ``namespaced`` are the builders written elsewhere that
    this module can call, keyed by the spelling it calls them under.
    ``callers`` names this module's own builders that another module calls, so
    a builder whose only callers are elsewhere is still answered for at them
    rather than recorded where it is written.
    """

    builders: dict[str, _Builder] = field(default_factory=dict)
    namespaced: dict[tuple[str, str], _Builder] = field(default_factory=dict)
    callers: frozenset[str] = frozenset()


class _Visitor(ast.NodeVisitor):
    def __init__(
        self,
        module: ast.Module,
        result: Extraction,
        file: str = "",
        foreign: _Foreign | None = None,
    ) -> None:
        self.result = result
        self.file = file
        self.scopes: list[ast.AST] = [module]
        self.event_names = _alias_names(module, EVENT_NAME)
        self.helper_names = _alias_names(module, HELPER_NAME)
        self.helper_signature = self._helper_signature(module)
        self.candidates = self._single_purpose_builders(module)
        self.called = _called_names(module)
        self.attribute_calls = _attribute_calls(module)
        self.imported = _imported_names(module)
        self.namespaces = _namespace_aliases(module)
        self.scope_bindings: dict[int, set[str]] = {}
        reached = foreign or _Foreign()
        own = {
            name: builder
            for name, builder in self.candidates.items()
            if name in self.called or name in reached.callers
        }
        self.builders = {**own, **reached.builders}
        self.namespaced_builders = reached.namespaced
        self.builder_sites = {id(builder.site) for builder in own.values()}

    # A helper carries a frame's code and message through its own parameters,
    # so where those parameters sit is read off the helper's definition rather
    # than assumed. Reordering them then moves what a call site is read for
    # instead of quietly swapping the code and the message. Every name in the
    # alias set stands for that one definition, so the signature it yields
    # answers for a call written under any of them.
    def _helper_signature(self, module: ast.Module) -> _HelperSignature | None:
        for function in ast.walk(module):
            if not isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if function.name not in self.helper_names:
                continue
            parameters, positional = _parameter_names(function)
            for node in ast.walk(function):
                if not isinstance(node, ast.Call):
                    continue
                if _marker_name(node.func, self.event_names) is None:
                    continue
                keywords = {kw.arg: kw.value for kw in node.keywords if kw.arg}
                code_index, code_parameter = _parameter_slot(
                    keywords.get("code"), parameters, positional
                )
                message_index, message_parameter = _parameter_slot(
                    keywords.get("message"), parameters, positional
                )
                return _HelperSignature(
                    code_index=code_index,
                    code_parameter=code_parameter,
                    message_index=message_index,
                    message_parameter=message_parameter,
                )
        return None

    # A message literal that reaches the wire as an argument is pinned by
    # nothing unless the call site is followed into the builder. A module-level
    # function is a candidate builder when it holds exactly one terminal frame,
    # that frame's code resolves to exactly one literal, and its message is a
    # bare reference to one of the function's own parameters. It becomes a
    # builder once something calls it, here or in another module the extractor
    # reads. Such a builder is recorded at its callers rather than where it is
    # written: each call contributes the template its message argument renders
    # to, so a reworded sentence fails here. An argument that is not a literal
    # renders to the placeholder, exactly as it would at a direct construction
    # site.
    def _single_purpose_builders(self, module: ast.Module) -> dict[str, _Builder]:
        candidates: dict[str, _Builder] = {}
        for function in module.body:
            if not isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            sites = [
                (node, *self._frame_arguments(node))
                for node in ast.walk(function)
                if self._frame_callee(node) is not None
            ]
            if len(sites) != 1:
                continue
            site, code_node, message_node = sites[0]
            codes = _resolve_code(code_node, [module, function])
            if codes is None or len(codes) != 1:
                continue
            if not isinstance(message_node, ast.Name):
                continue
            parameters, positional = _parameter_names(function)
            if message_node.id not in parameters:
                continue
            index = parameters.index(message_node.id)
            candidates[function.name] = _Builder(
                code=codes[0],
                parameter=message_node.id,
                index=index if index < positional else None,
                site=site,
            )
        return candidates

    def _frame_callee(self, node: ast.AST) -> str | None:
        if not isinstance(node, ast.Call):
            return None
        return _marker_name(node.func, self.event_names | self.helper_names)

    def _frame_arguments(self, node: ast.Call) -> tuple[ast.AST | None, ast.AST | None]:
        keywords = {kw.arg: kw.value for kw in node.keywords if kw.arg}
        if _marker_name(node.func, self.helper_names) is not None:
            signature = self.helper_signature
            if signature is None:
                return None, None
            return (
                _argument_at(
                    node, keywords, signature.code_index, signature.code_parameter
                ),
                _argument_at(
                    node,
                    keywords,
                    signature.message_index,
                    signature.message_parameter,
                ),
            )
        code, message = keywords.get("code"), keywords.get("message")
        if code is None and message is None:
            # ``model_validate`` takes the whole frame as one mapping, so the
            # fields sit in a dict literal rather than in keywords.
            mapping = node.args[0] if len(node.args) == 1 else None
            if isinstance(mapping, ast.Dict):
                fields = (
                    _mapping_value(mapping, "code"),
                    _mapping_value(mapping, "message"),
                )
                if any(isinstance(field, _Unreadable) for field in fields):
                    return None, None
                return fields
        return code, message

    def _visit_scope(self, node: ast.AST) -> None:
        self.scopes.append(node)
        self.generic_visit(node)
        self.scopes.pop()

    visit_FunctionDef = _visit_scope
    visit_AsyncFunctionDef = _visit_scope
    visit_ClassDef = _visit_scope
    # A lambda owns its parameters, so what shadows a module alias inside one
    # has to be visible here as well as to the reading that finds callers.
    visit_Lambda = _visit_scope

    def _builder_for(self, node: ast.Call) -> _Builder | None:
        """The builder a call reaches, under either spelling that can reach one.

        A builder is followed only where the call names it: by its own bare
        name, or through the module alias its own module is bound to here,
        read the same way the search for its callers reads it. An unrelated
        method that happens to share the trailing name carries none of its
        sentences to the wire.
        """
        name = _called_name(node)
        if name is not None:
            return self.builders.get(name)
        qualified = _qualified_callee(node)
        if qualified is None:
            return None
        qualifier, member = qualified
        if _shadowed(qualifier, self.scopes, self.scope_bindings):
            return None
        return self.namespaced_builders.get((qualifier, member))

    def visit_Call(self, node: ast.Call) -> None:
        builder = self._builder_for(node)
        if builder is not None:
            self._record_builder_call(builder, node)
        elif self._frame_callee(node) is not None:
            if id(node) in self.builder_sites:
                # Answered for at its callers, where the sentences it carries
                # are read.
                self.result.delegated_sites += 1
                self._account(node, True)
            else:
                code, message = self._frame_arguments(node)
                self._record(node, code, message)
        self.generic_visit(node)

    def _account(self, node: ast.AST, resolved: bool) -> None:
        """A site is listed here at the moment one of the tracks takes it."""
        line, column = _position(node)
        self.result.sites.append(Site(self.file, line, column, resolved))

    def _record_builder_call(self, builder: _Builder, node: ast.Call) -> None:
        argument: ast.AST | None = None
        for keyword in node.keywords:
            if keyword.arg == builder.parameter:
                argument = keyword.value
        if (
            argument is None
            and builder.index is not None
            and len(node.args) > builder.index
        ):
            argument = node.args[builder.index]
        templates = [PLACEHOLDER] if argument is None else _render_message(argument)
        self._account(node, True)
        for template in templates:
            self.result.record(builder.code, template)

    def _record(
        self,
        node: ast.AST,
        code_node: ast.AST | None,
        message_node: ast.AST | None,
    ) -> None:
        codes = _resolve_code(code_node, self.scopes)
        if codes is None:
            self.result.unresolved_sites += 1
            self._account(node, False)
            self._record_packed_pair(code_node, message_node)
            return
        self.result.recorded_sites += 1
        self._account(node, True)
        for code in codes:
            for message in _render_message(message_node):
                self.result.record(code, message)

    # A code and its message can be packed into one tuple and unpacked at the
    # frame that writes them, which is the only place their pairing survives.
    # The frame stays the unresolved site, because what it carries is decided
    # where the tuple is built; the pairing is read there instead, and only
    # from the tuple bindings that can still hold where the frame unpacks
    # them, so an unrelated pair of the same name records nothing.
    def _record_packed_pair(
        self, code_node: ast.AST | None, message_node: ast.AST | None
    ) -> None:
        if not isinstance(code_node, ast.Name) or not isinstance(
            message_node, ast.Name
        ):
            return
        for unpack in self._live(code_node.id, _position(code_node)):
            packed_name = getattr(unpack.node, "value", None)
            indices = _unpacked_indices(unpack.node, code_node.id, message_node.id)
            if not isinstance(packed_name, ast.Name) or indices is None:
                continue
            code_index, message_index = indices
            for bind in self._live(packed_name.id, _position(unpack.node)):
                packed = bind.value
                if not isinstance(packed, ast.Tuple):
                    continue
                if max(code_index, message_index) >= len(packed.elts):
                    continue
                codes = _resolve_code(packed.elts[code_index], self.scopes)
                if codes is None:
                    continue
                for code in codes:
                    for message in _render_message(packed.elts[message_index]):
                        self.result.record(code, message)

    def _live(self, name: str, use: tuple[int, int]) -> list[_Bind]:
        for scope in reversed(_lookup_chain(self.scopes)):
            live = _live_bindings(scope, name, use)
            if live:
                return live
        return []


def _module_stem(file: str) -> str:
    return Path(file).stem


def _qualifiers(probe: _Visitor, stem: str, package: str) -> set[str]:
    """Names a module can write ahead of a member of the module ``stem``.

    A name is one only where an import binds it to that module, so a local of
    the same name calling a method of the same name records nothing.
    """
    return {
        alias
        for alias, origin in probe.namespaces.items()
        if _reads(origin, package) == stem
    }


def _foreign_for(file: str, probes: dict[str, _Visitor], package: str) -> _Foreign:
    """Builders the other read modules lend this one, and the ones it lends them.

    A builder's own frame is answered for at its callers, so a caller in
    another read module has to be found: leaving it out drops the sentence it
    hands over while the site it came from still reads as delegated.
    """
    here = probes[file]
    mine = _module_stem(file)
    builders: dict[str, _Builder] = {}
    namespaced: dict[tuple[str, str], _Builder] = {}
    callers: set[str] = set()
    for other, probe in probes.items():
        if other == file:
            continue
        there = _module_stem(other)
        for local, (origin, original) in here.imported.items():
            builder = probe.candidates.get(original)
            if _reads(origin, package) == there and builder is not None:
                builders[local] = builder
        for qualifier in _qualifiers(here, there, package):
            for original, builder in probe.candidates.items():
                namespaced[(qualifier, original)] = builder
        for local, (origin, original) in probe.imported.items():
            if _reads(origin, package) == mine and local in probe.called:
                callers.add(original)
        for qualifier in _qualifiers(probe, mine, package):
            callers |= probe.attribute_calls.get(qualifier, set())
    return _Foreign(
        builders=builders, namespaced=namespaced, callers=frozenset(callers)
    )


def _parse(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"))


def _probe(module: ast.Module, file: str) -> _Visitor:
    """A reading of a module that records nothing, for what it offers the rest."""
    return _Visitor(module, Extraction(), file)


def extract_source(path: Path) -> Extraction:
    """Codes and message templates found in one source file, read on its own."""
    result = Extraction()
    module = _parse(path)
    _Visitor(module, result, path.name).visit(module)
    return result


def extract(src_root: Path = SRC_ROOT) -> Extraction:
    """Codes and message templates found across the modules that build frames.

    The modules are read together rather than one at a time, so a builder
    written in one of them and called in another is recorded at that call
    instead of falling between the two files.
    """
    parsed = {name: _parse(src_root / name) for name in SOURCE_FILES}
    probes = {name: _probe(module, name) for name, module in parsed.items()}
    result = Extraction()
    for name, module in parsed.items():
        foreign = _foreign_for(name, probes, src_root.name)
        _Visitor(module, result, name, foreign).visit(module)
    return result


def source_string_literals(src_root: Path = SRC_ROOT) -> set[str]:
    """Text written as a string literal in the extracted modules.

    An f-string's fragments count, as a TypeScript template literal's do on the
    other side. Docstrings are left out with the comments they read like, so a
    constant that survives only in prose about the code does not answer for the
    code.
    """
    found: set[str] = set()
    for name in SOURCE_FILES:
        module = ast.parse((src_root / name).read_text(encoding="utf-8"))
        prose = {
            id(node.body[0].value)
            for node in ast.walk(module)
            if isinstance(
                node,
                (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef),
            )
            and node.body
            and isinstance(node.body[0], ast.Expr)
            and isinstance(node.body[0].value, ast.Constant)
            and isinstance(node.body[0].value.value, str)
        }
        found.update(
            node.value
            for node in ast.walk(module)
            if isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and id(node) not in prose
        )
    return found


def _reaches_a_builder(
    here: _Visitor, probes: dict[str, _Visitor], file: str, package: str
) -> bool:
    """Whether a module calls a builder written in one of the read modules.

    Such a module carries sentences to the wire while writing no frame of its
    own, so nothing about the frames it builds would give it away.
    """
    for other, probe in probes.items():
        there = _module_stem(other)
        if there == _module_stem(file):
            continue
        for local, (origin, original) in here.imported.items():
            if (
                _reads(origin, package) == there
                and local in here.called
                and original in probe.candidates
            ):
                return True
        for qualifier in _qualifiers(here, there, package):
            if here.attribute_calls.get(qualifier, set()) & set(probe.candidates):
                return True
    return False


def emitting_files(src_root: Path = SRC_ROOT) -> set[str]:
    """Package modules that build a terminal error frame, or reach one.

    Compared against ``SOURCE_FILES``, this is what stops a third module from
    being invisible to extraction simply by not being listed, whether it builds
    a frame itself or only hands a sentence to a builder in a listed module.
    """
    probes = {
        name: _probe(_parse(src_root / name), name) for name in SOURCE_FILES
    }
    found: set[str] = set()
    for path in sorted(src_root.rglob("*.py")):
        relative = path.relative_to(src_root).as_posix()
        probe = Extraction()
        module = _parse(path)
        here = _Visitor(module, probe, relative)
        here.visit(module)
        if (
            probe.messages_by_code
            or probe.unresolved_sites
            or _reaches_a_builder(here, probes, relative, src_root.name)
        ):
            found.add(relative)
    return found
