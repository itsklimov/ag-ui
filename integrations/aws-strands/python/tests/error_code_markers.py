"""An independent reading of where a source builds a terminal error frame.

``test_error_code_accounting.py`` holds extraction to answering for every site
this finds, and the soundness suite counts sites with it. It deliberately does
not import the extractor: a recogniser borrowed from the reader it checks would
agree with that reader by construction and would assert nothing at all.

The reading is deliberately blunter than the extractor's. A name stands for a
marker as soon as anything anywhere in the module binds it from an expression
still holding one, with no regard for scope or for which binding can reach the
call, and with no regard for where in that expression the marker sits: written
into a dict, a tuple or a list, or handed to something that builds with it. A
call counts when any name written anywhere in its callee is one of those, so
the marker called on its own, reached through the module holding it, asked for
one of its own class methods, and looked up back out of a table all count.
Both readings walk a subtree where the extractor walks a dotted chain, which
is what keeps this a superset rather than a second copy of the extractor's
blind spots, and the direction that makes the accounting a demand rather than
an echo.
"""

from __future__ import annotations

import ast
from pathlib import Path

# Spelled out here rather than imported, for the same reason the reading is.
CANONICAL_MARKERS = ("RunErrorEvent", "_error_events")


def _names_in(node: ast.AST | None) -> set[str]:
    """Every name written anywhere in an expression."""
    found: set[str] = set()
    if node is None:
        return found
    for inner in ast.walk(node):
        if isinstance(inner, ast.Name):
            found.add(inner.id)
        elif isinstance(inner, ast.Attribute):
            found.add(inner.attr)
    return found


def _names_held_by(node: ast.AST | None) -> set[str]:
    """Names of what an expression still holds once it is bound to a name.

    A container keeps what is put into it, so a marker written into a dict, a
    tuple or a list is reachable through the name that container is bound to.
    What a call returns is not the thing called, so its callee is not
    descended into: binding a built frame is how this adapter reports an
    error, not how it gives the constructor another name.
    """
    found: set[str] = set()
    if node is None:
        return found
    if isinstance(node, ast.Name):
        found.add(node.id)
    elif isinstance(node, ast.Attribute):
        found.add(node.attr)
    for child in ast.iter_child_nodes(node):
        if isinstance(node, ast.Call) and child is node.func:
            continue
        found |= _names_held_by(child)
    return found


def _binding(node: ast.AST) -> tuple[list[ast.AST], ast.AST | None] | None:
    """What a statement binds, and the expression it binds it from."""
    if isinstance(node, ast.Assign):
        return list(node.targets), node.value
    if isinstance(node, (ast.AnnAssign, ast.NamedExpr)):
        return [node.target], node.value
    if isinstance(node, (ast.For, ast.AsyncFor)):
        return [node.target], node.iter
    if isinstance(node, ast.withitem):
        return ([node.optional_vars] if node.optional_vars else []), node.context_expr
    return None


def _marker_spellings(module: ast.Module) -> set[str]:
    """Every name that stands for a marker anywhere in this module."""
    names = set(CANONICAL_MARKERS)
    changed = True
    while changed:
        changed = False
        for node in ast.walk(module):
            bound: set[str] = set()
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                bound = {
                    alias.asname
                    for alias in node.names
                    if alias.asname and alias.name.rsplit(".", 1)[-1] in names
                }
            else:
                binding = _binding(node)
                if binding is not None and _names_held_by(binding[1]) & names:
                    targets, _ = binding
                    bound = {
                        name for target in targets for name in _names_in(target)
                    }
            for name in bound:
                if name not in names:
                    names.add(name)
                    changed = True
    return names


def marker_sites(path: Path) -> list[tuple[int, int]]:
    """Where a source calls something standing for a construction marker."""
    module = ast.parse(path.read_text(encoding="utf-8"))
    names = _marker_spellings(module)
    return sorted(
        (node.lineno, node.col_offset)
        for node in ast.walk(module)
        if isinstance(node, ast.Call) and _names_in(node.func) & names
    )
