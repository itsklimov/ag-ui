/**
 * Static extraction of the RUN_ERROR codes and message texts this adapter emits.
 *
 * The terminal error codes and their message strings are a wire contract:
 * clients and mock harnesses match both literally. Deriving the set from the
 * source rather than from a hand-maintained list inside the package is what
 * turns a divergence from the Python sibling into a test failure at the moment
 * it is introduced.
 *
 * Extraction is syntactic, and the rule it and its Python sibling both follow
 * is this: a site counts as a terminal-error construction when the marker it is
 * written with is recognised, which means an object literal typed `RUN_ERROR`,
 * the `_runError` helper, or a local alias of either on this side, and the
 * `RunErrorEvent` constructor or the `_error_events` helper on the Python side.
 * A recognised site is then either recorded against the code literals it
 * resolves to, or counted as unresolved. Counting covers every reason a code
 * can fail to resolve, whether it is a parameter, computed, keyed in a way that
 * cannot be read, or absent altogether, so a new way of emitting one cannot
 * slip past unreviewed.
 *
 * Resolution is deliberately narrow, because a code read off the wrong evidence
 * is worse than one not read at all: it reports a contract the adapter does not
 * keep while the suite stays green. Four shapes resolve, each only to what it
 * evaluates to where it is written: a literal, either arm of a conditional, a
 * name read off the bindings that can still hold there, and a call read off what
 * its function returns. A literal elsewhere in the same subtree, or under the
 * same name on a path that cannot reach the site, is evidence of nothing.
 *
 * That rule is only worth what recognition is worth, so recognition is
 * one-sided: a literal carrying a `type` is dismissed only when that type is
 * read plainly and names some other event. A type written in a way this cannot
 * settle leaves the site recognised, and therefore answered for, rather than
 * dropped by a reader that guessed. `error-code-accounting.test.ts` asserts
 * that join over these sources, the corpus, and shapes of its own.
 *
 * `../../../error-code-corpus` holds one tiny synthetic source per shape either
 * language can write a frame in, and the corpus suite on each side asserts what
 * that side reads out of it, so a shape one extractor sees and the other does
 * not fails rather than drifting.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const SRC_ROOT = path.resolve(__dirname, "..");

// Modules that construct terminal error frames. Listing them beats globbing:
// a new emitting module becomes a reviewed edit here rather than a silent one.
// `emittingFiles` below is what keeps the list honest.
export const SOURCE_FILES = ["agent.ts", "endpoint.ts"] as const;

/** The event type a terminal frame carries, and the helper that builds one. */
const RUN_ERROR = "RUN_ERROR";
const HELPER_NAME = "_runError";

/**
 * Codes are screaming snake case. Underscores are optional so a single-token
 * code is recorded under its own name rather than counted as unresolved; a
 * string that only looks like one still has to sit in a code position, and
 * every way of getting that wrong fails the parity assertions out loud.
 */
const CODE_LITERAL = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

/**
 * Placeholder standing in for any interpolated value, so a template can be
 * compared against the Python sibling's without either language's
 * interpolation syntax leaking into the comparison.
 */
export const PLACEHOLDER = "{}";

/**
 * What a frame carrying no message at all renders as. A frame whose message is
 * computed renders as PLACEHOLDER, and one with no message is a different fault
 * entirely, so the two must not answer for each other.
 */
export const MISSING_MESSAGE = "<no message>";

/**
 * One recognised construction site, and which track answered for it.
 *
 * Every site is listed, resolved or not, so that a site being read at all can
 * be asserted from outside rather than inferred from the codes that came out.
 */
export interface Site {
  file: string;
  start: number;
  resolved: boolean;
}

export interface Extraction {
  messagesByCode: Map<string, Set<string>>;
  unresolvedSites: number;
  sites: Site[];
}

function emptyExtraction(): Extraction {
  return { messagesByCode: new Map(), unresolvedSites: 0, sites: [] };
}

function isTextLiteral(
  node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/** An expression with its parentheses and type assertions taken off. */
function unwrap(node: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return unwrap(node.expression);
  }
  return node;
}

/** Literal text of a string expression, or `undefined` when it is not one. */
function renderLiteral(node: ts.Expression): string | undefined {
  const expression = unwrap(node);
  if (isTextLiteral(expression)) {
    return expression.text;
  }
  if (ts.isTemplateExpression(expression)) {
    let out = expression.head.text;
    for (const span of expression.templateSpans) {
      out += PLACEHOLDER + span.literal.text;
    }
    return out;
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = renderLiteral(expression.left);
    const right = renderLiteral(expression.right);
    // A concatenation stays a template as long as one side is literal: the
    // non-literal side is an interpolated value like any other. An empty
    // literal side is still a literal side, and contributes nothing.
    if (left === undefined && right === undefined) return undefined;
    return (left ?? PLACEHOLDER) + (right ?? PLACEHOLDER);
  }
  return undefined;
}

/**
 * Message templates a node can produce, one per branch it can take.
 *
 * The text around the placeholders is exactly what the literal holds. Neither
 * language pads a sentence for being written over several source lines, so
 * every space and newline in a rendered template is one the wire carries, and
 * normalising them away would hide both a reword that only moves whitespace and
 * a bridge that wraps a shared sentence differently from its sibling.
 */
function renderMessage(node: ts.Expression | undefined): string[] {
  if (!node) return [MISSING_MESSAGE];
  const expression = unwrap(node);
  if (ts.isConditionalExpression(expression)) {
    return [
      ...renderMessage(expression.whenTrue),
      ...renderMessage(expression.whenFalse),
    ];
  }
  // `computed || "fallback"` reaches the wire as either operand, and the
  // fallback is usually the only sentence written down anywhere.
  if (
    ts.isBinaryExpression(expression) &&
    (expression.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    return [
      ...renderMessage(expression.left),
      ...renderMessage(expression.right),
    ];
  }
  const literal = renderLiteral(expression);
  return [literal === undefined ? PLACEHOLDER : literal];
}

/**
 * Text written as a literal anywhere in a subtree.
 *
 * A template literal's own fragments count: they are written in the source
 * exactly as a plain literal is, and the Python sibling reads an f-string's
 * fragments the same way.
 */
function stringLiteralsWithin(node: ts.Node): string[] {
  const found: string[] = [];
  const walk = (child: ts.Node): void => {
    if (isTextLiteral(child)) {
      found.push(child.text);
    } else if (ts.isTemplateExpression(child)) {
      found.push(child.head.text);
      for (const span of child.templateSpans) found.push(span.literal.text);
    }
    ts.forEachChild(child, walk);
  };
  walk(node);
  return found;
}

/** Trailing name of a bare or dotted reference. */
function referencedName(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return undefined;
}

/** Name of a call written as a bare name, rather than reached through one. */
function calledName(node: ts.CallExpression): string | undefined {
  const callee = unwrap(node.expression);
  return ts.isIdentifier(callee) ? callee.text : undefined;
}

/** The qualifier and member of a call written as `qualifier.member(...)`. */
function qualifiedCallee(
  node: ts.CallExpression,
): { qualifier: string; member: string } | undefined {
  const callee = unwrap(node.expression);
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  const base = unwrap(callee.expression);
  if (!ts.isIdentifier(base)) return undefined;
  return { qualifier: base.text, member: callee.name.text };
}

/**
 * The package file a relative specifier names, or `undefined` for anything else.
 *
 * A module is identified by the file it is, never by the trailing name of the
 * specifier that reached it: a stem matches every module of that name anywhere,
 * so a third-party import would answer for one of ours. Python's sibling keeps
 * the same rule by requiring a relative import or an absolute path inside the
 * package.
 */
function resolveModule(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
    if (candidate.endsWith(".ts") && existsSync(candidate)) return candidate;
  }
  return undefined;
}

function parseFile(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

/** Whether a module writes the declaration a name stands for. */
function declaresName(source: ts.SourceFile, name: string): boolean {
  return source.statements.some((statement) => {
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) && declaration.name.text === name,
      );
    }
    return (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name?.text === name
    );
  });
}

/**
 * The module a name reached through `file` is written in, and its name there.
 *
 * A re-export barrel is a module like any other to an import, so a builder
 * reached through one has to be followed back to where it is written; stopping
 * at the barrel leaves the module calling it invisible, which is exactly what
 * the emitting-module guard exists to catch. A star re-export names no name of
 * its own, so it is followed only as far as a module that declares the one
 * being looked for. A specifier leading out of the package cannot reach a
 * builder in it, and stops the search where it is.
 */
function definingModule(
  file: string,
  name: string,
  seen: Set<string> = new Set(),
): { file: string; name: string } {
  if (seen.has(file)) return { file, name };
  const source = parseFile(file);
  const walked = new Set(seen).add(file);
  const stars: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) {
      continue;
    }
    if (!isTextLiteral(statement.moduleSpecifier)) continue;
    const target = resolveModule(file, statement.moduleSpecifier.text);
    if (!target) continue;
    const clause = statement.exportClause;
    if (!clause) {
      stars.push(target);
      continue;
    }
    if (!ts.isNamedExports(clause)) continue;
    for (const element of clause.elements) {
      if (element.name.text !== name) continue;
      const original = (element.propertyName ?? element.name).text;
      return definingModule(target, original, walked);
    }
  }
  if (declaresName(source, name)) return { file, name };
  for (const target of stars) {
    const through = definingModule(target, name, walked);
    if (declaresName(parseFile(through.file), through.name)) return through;
  }
  return { file, name };
}

/** Names a source calls as bare names. */
function calledNames(source: ts.SourceFile): Set<string> {
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calledName(node);
      if (name !== undefined) found.add(name);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return found;
}

/** Names called through a qualifier, keyed by the qualifier next to them. */
function attributeCalls(source: ts.SourceFile): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const qualified = qualifiedCallee(node);
      if (qualified) {
        const members = found.get(qualified.qualifier) ?? new Set<string>();
        members.add(qualified.member);
        found.set(qualified.qualifier, members);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return found;
}

interface Imported {
  /** The package file the name is written in, unset when it is written outside. */
  module: string | undefined;
  name: string;
}

/** Names taken from another module, as local name to module and original. */
function importedNames(
  file: string,
  source: ts.SourceFile,
): Map<string, Imported> {
  const found = new Map<string, Imported>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!isTextLiteral(statement.moduleSpecifier)) continue;
    const target = resolveModule(file, statement.moduleSpecifier.text);
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const original = (element.propertyName ?? element.name).text;
      const origin = target ? definingModule(target, original) : undefined;
      found.set(element.name.text, {
        module: origin?.file,
        name: origin?.name ?? original,
      });
    }
  }
  return found;
}

/** Local names standing for a whole module, as local name to that module. */
function namespaceAliases(
  file: string,
  source: ts.SourceFile,
): Map<string, string> {
  const found = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!isTextLiteral(statement.moduleSpecifier)) continue;
    const target = resolveModule(file, statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (!clause || !target) continue;
    if (clause.name) found.set(clause.name.text, target);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      found.set(bindings.name.text, target);
    }
  }
  return found;
}

/** Whether a node owns the names bound inside it. */
function opensScope(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isClassStaticBlockDeclaration(node)
  );
}

/**
 * One way a name is bound, and the expression it is bound to.
 *
 * `value` is unset when the bound expression is not written here: a
 * destructuring, a loop target, a parameter, an import. Such a binding resolves
 * to nothing, leaving the site reading the name unresolved rather than read off
 * something the name never holds.
 */
interface Binding {
  node: ts.Node;
  value: ts.Expression | undefined;
}

/** Statements that end the path they sit on. */
function terminates(node: ts.Node): boolean {
  return (
    ts.isReturnStatement(node) ||
    ts.isThrowStatement(node) ||
    ts.isBreakStatement(node) ||
    ts.isContinueStatement(node)
  );
}

function statementsOf(node: ts.Statement | undefined): ts.Statement[] {
  if (!node) return [];
  return ts.isBlock(node) ? [...node.statements] : [node];
}

function isLoop(node: ts.Node): node is ts.IterationStatement {
  return (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  );
}

interface Branches {
  bodies: ts.Statement[][];
  trailing: ts.Statement[];
}

/**
 * Bodies a statement owns but does not run in sequence, and what follows.
 *
 * An empty body stands for the path that skips the branches, which is how a
 * binding made before an `if` with no `else` survives it. A switch clause is
 * paired with the clauses below it, because entering at one runs the rest until
 * something ends the path, so a binding it makes is live in the clause it falls
 * through into.
 */
function branchBodies(node: ts.Node): Branches {
  if (ts.isIfStatement(node)) {
    return {
      bodies: [
        statementsOf(node.thenStatement),
        statementsOf(node.elseStatement),
      ],
      trailing: [],
    };
  }
  if (ts.isTryStatement(node)) {
    const bodies = [[...node.tryBlock.statements]];
    if (node.catchClause) bodies.push([...node.catchClause.block.statements]);
    return {
      bodies,
      trailing: node.finallyBlock ? [...node.finallyBlock.statements] : [],
    };
  }
  if (isLoop(node)) {
    return { bodies: [statementsOf(node.statement), []], trailing: [] };
  }
  if (ts.isSwitchStatement(node)) {
    const clauses = node.caseBlock.clauses;
    const bodies = clauses.map((_, index) =>
      clauses.slice(index).flatMap((clause) => [...clause.statements]),
    );
    return { bodies: [...bodies, []], trailing: [] };
  }
  if (ts.isBlock(node)) {
    return { bodies: [[...node.statements]], trailing: [] };
  }
  if (ts.isLabeledStatement(node)) {
    return { bodies: [statementsOf(node.statement)], trailing: [] };
  }
  return { bodies: [], trailing: [] };
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind >= ts.SyntaxKind.FirstAssignment &&
    kind <= ts.SyntaxKind.LastAssignment
  );
}

/** Whether a destructuring target writes into `name`. */
function assignsName(target: ts.Expression, name: string): boolean {
  const node = unwrap(target);
  if (ts.isIdentifier(node)) return node.text === name;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some((element) => assignsName(element, name));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.some((property) => {
      if (ts.isShorthandPropertyAssignment(property)) {
        return property.name.text === name;
      }
      if (ts.isPropertyAssignment(property)) {
        return assignsName(property.initializer, name);
      }
      return (
        ts.isSpreadAssignment(property) &&
        assignsName(property.expression, name)
      );
    });
  }
  if (ts.isSpreadElement(node)) return assignsName(node.expression, name);
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    // A default written into a destructuring target, whose left side is what
    // the target binds.
    return assignsName(node.left, name);
  }
  return false;
}

/**
 * Whether a node binds `name` somewhere other than in an assignment target.
 *
 * A declaration and an import spell what they bind this way, so no assignment
 * stands for them.
 */
function namesItself(node: ts.Node, name: string): boolean {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
    return node.name?.text === name;
  }
  if (
    ts.isImportSpecifier(node) ||
    ts.isImportClause(node) ||
    ts.isNamespaceImport(node)
  ) {
    return node.name !== undefined && node.name.text === name;
  }
  return false;
}

/**
 * Bindings of `name` a statement makes itself, its branches excluded.
 *
 * Anything that puts the name in scope counts, not an assignment carrying a
 * readable value alone: a binding the scan cannot see is answered from an older
 * one or from an outer scope, which is the wrong-value reading this file exists
 * to prevent.
 */
function ownBindings(statement: ts.Node, name: string): Binding[] {
  const { bodies, trailing } = branchBodies(statement);
  const nested = new Set<ts.Node>();
  for (const body of [...bodies, trailing]) {
    for (const child of body) nested.add(child);
  }
  const found: Binding[] = [];
  const visit = (node: ts.Node): void => {
    if (nested.has(node)) return;
    if (
      (ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
      !ts.isVariableDeclarationList(node.initializer) &&
      assignsName(node.initializer, name)
    ) {
      // A loop target that is not a declaration still binds the name on every
      // pass, and what it binds is the iteration's own value rather than an
      // expression written here, exactly as a destructuring target is.
      found.push({ node, value: undefined });
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found.push({ node, value: node.initializer });
      if (node.initializer) visit(node.initializer);
      return;
    }
    if (
      ts.isBindingElement(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      // What a destructuring hands this element is not written here, and its
      // own initializer is only the default standing in when nothing is.
      found.push({ node, value: undefined });
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      isAssignmentOperator(node.operatorToken.kind) &&
      assignsName(node.left, name)
    ) {
      const plain =
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(unwrap(node.left));
      found.push({ node, value: plain ? node.right : undefined });
      visit(node.right);
      return;
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken) &&
      ts.isIdentifier(node.operand) &&
      node.operand.text === name
    ) {
      found.push({ node, value: undefined });
      return;
    }
    if (namesItself(node, name)) found.push({ node, value: undefined });
    // A nested scope owns the names bound inside it. Its own declaration still
    // binds the name it is written under, which is why the check above comes
    // first.
    if (opensScope(node)) return;
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return found;
}

/**
 * One search for the bindings of a name that can hold at a position.
 *
 * `broken` and `continued` carry one entry per enclosing loop. A path that ends
 * in `break` or `continue` does not stop there the way a `return` does: it
 * arrives after the loop, or back at its head, and the bindings it is carrying
 * arrive with it.
 */
interface LiveScan {
  name: string;
  use: number;
  atUse: Binding[];
  broken: Binding[][];
  continued: Binding[][];
}

function containsPosition(node: ts.Node, position: number): boolean {
  return node.getStart() <= position && position < node.getEnd();
}

/** Innermost function around a node, or the source file when there is none. */
function enclosingScope(node: ts.Node): ts.Node {
  let current: ts.Node | undefined = node.parent;
  while (current && !opensScope(current) && !ts.isSourceFile(current)) {
    current = current.parent;
  }
  return current ?? node;
}

function dedup(bindings: Binding[]): Binding[] {
  const seen = new Set<ts.Node>();
  const found: Binding[] = [];
  for (const binding of bindings) {
    if (seen.has(binding.node)) continue;
    seen.add(binding.node);
    found.push(binding);
  }
  return found;
}

function covered(bindings: Binding[], by: Binding[]): boolean {
  const nodes = new Set(by.map((binding) => binding.node));
  return bindings.every((binding) => nodes.has(binding.node));
}

/** Bindings live after a set of alternative bodies, and whether all ended. */
function mergePaths(
  paths: [ts.Statement[], Binding[]][],
  scan: LiveScan,
): [Binding[], boolean] {
  let merged: Binding[] = [];
  let ended = true;
  for (const [body, live] of paths) {
    const [out, branchEnded] = scanBlock(body, live, scan);
    if (branchEnded) continue;
    ended = false;
    merged = merged.concat(out);
  }
  return [dedup(merged), ended];
}

/** Every binding of `name` written anywhere in a block. */
function allBindings(statements: ts.Statement[], name: string): Binding[] {
  const found: Binding[] = [];
  for (const statement of statements) {
    found.push(...ownBindings(statement, name));
    const { bodies, trailing } = branchBodies(statement);
    for (const body of [...bodies, trailing]) {
      found.push(...allBindings(body, name));
    }
  }
  return found;
}

/**
 * Bindings live after a try, its handler reached from inside the body.
 *
 * A throw happens at some point in the body, not before it, so the handler runs
 * carrying whatever the body had bound by then. Which point cannot be known, so
 * any binding the body makes can be the one it finds. That over-approximates,
 * letting the handler see a binding that may not have been reached, which is
 * the direction that leaves a code the adapter can put on the wire reported
 * rather than dropped.
 */
function scanTry(
  statement: ts.TryStatement,
  live: Binding[],
  scan: LiveScan,
): [Binding[], boolean] {
  const body = [...statement.tryBlock.statements];
  const caught = dedup([...live, ...allBindings(body, scan.name)]);
  const paths: [ts.Statement[], Binding[]][] = [[body, live]];
  if (statement.catchClause) {
    paths.push([[...statement.catchClause.block.statements], caught]);
  }
  return mergePaths(paths, scan);
}

/**
 * Bindings live after a loop.
 *
 * The body is rescanned until what arrives at the head stops growing, because a
 * binding one iteration makes is live for the next one and for every use
 * written above it. What leaves is what reaches the head, plus what any `break`
 * was carrying.
 */
function scanLoop(
  statement: ts.IterationStatement,
  live: Binding[],
  scan: LiveScan,
): Binding[] {
  scan.broken.push([]);
  scan.continued.push([]);
  let head = live;
  for (;;) {
    const [out, ended] = scanBlock(
      statementsOf(statement.statement),
      head,
      scan,
    );
    const arriving = dedup([
      ...head,
      ...(ended ? [] : out),
      ...scan.continued[scan.continued.length - 1]!,
    ]);
    if (covered(arriving, head)) break;
    head = arriving;
  }
  scan.continued.pop();
  const broken = scan.broken.pop()!;
  return dedup([...head, ...broken]);
}

/**
 * Bindings live after a block, and whether every path through it ended.
 *
 * What is live where the use is written is collected on every pass that reaches
 * it, not on the first alone, so a rescanned loop body contributes the bindings
 * a later iteration carries as well as a first one's.
 */
function scanBlock(
  statements: ts.Statement[],
  incoming: Binding[],
  scan: LiveScan,
): [Binding[], boolean] {
  let live = incoming;
  for (const statement of statements) {
    const { bodies, trailing } = branchBodies(statement);
    const inner = [...bodies.flat(), ...trailing];
    if (
      containsPosition(statement, scan.use) &&
      !inner.some((node) => containsPosition(node, scan.use))
    ) {
      scan.atUse.push(...live);
    }
    const own = ownBindings(statement, scan.name);
    if (own.length > 0) live = own;
    let ended = false;
    if (isLoop(statement)) {
      live = scanLoop(statement, live, scan);
    } else if (ts.isTryStatement(statement)) {
      [live, ended] = scanTry(statement, live, scan);
    } else if (bodies.length > 0) {
      [live, ended] = mergePaths(
        bodies.map((body): [ts.Statement[], Binding[]] => [body, live]),
        scan,
      );
    }
    if (trailing.length > 0) {
      const [after, endedTrailing] = scanBlock(trailing, live, scan);
      live = after;
      ended = ended || endedTrailing;
    }
    if (ts.isBreakStatement(statement) && scan.broken.length > 0) {
      scan.broken[scan.broken.length - 1]!.push(...live);
    }
    if (ts.isContinueStatement(statement) && scan.continued.length > 0) {
      scan.continued[scan.continued.length - 1]!.push(...live);
    }
    if (ended || terminates(statement)) return [live, true];
  }
  return [live, false];
}

function scopeStatements(scope: ts.Node): ts.Statement[] {
  if (ts.isSourceFile(scope)) return [...scope.statements];
  const body = (scope as { body?: ts.Node }).body;
  if (body && (ts.isBlock(body) || ts.isModuleBlock(body))) {
    return [...body.statements];
  }
  return [];
}

/** Bindings a scope's own parameters make of `name`. */
function parameterBindings(scope: ts.Node, name: string): Binding[] {
  const parameters =
    (scope as { parameters?: readonly ts.ParameterDeclaration[] }).parameters ??
    [];
  const found: Binding[] = [];
  for (const parameter of parameters) {
    if (ts.isIdentifier(parameter.name)) {
      if (parameter.name.text === name) {
        found.push({ node: parameter, value: undefined });
      }
      continue;
    }
    const visit = (node: ts.Node): void => {
      if (
        ts.isBindingElement(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === name
      ) {
        found.push({ node: parameter, value: undefined });
      }
      ts.forEachChild(node, visit);
    };
    visit(parameter.name);
  }
  return found;
}

/**
 * Bindings of `name` in `scope` that can still hold at `use`.
 *
 * Every binding a path to the use can be carrying is collected, not only the
 * nearest one: a default that one branch overwrites is still a code the adapter
 * emits, and keeping the branch's value alone drops it without a trace. A
 * binding a later unconditional one overwrites, and a binding on a branch that
 * leaves before the use, cannot arrive and stay out. A parameter is seeded as a
 * binding of its own, so a name a branch reassigns still answers with the
 * argument the other path leaves in place, and a parameter shadowing an outer
 * name answers instead of it. Nested scopes are not descended into, so a name
 * bound in an inner function never answers for a use in the function around it.
 */
function liveBindings(scope: ts.Node, name: string, use: number): Binding[] {
  const seed = parameterBindings(scope, name);
  const statements = scopeStatements(scope);
  // An expression-bodied arrow has no statements to scan, so its parameters are
  // all a use inside it can be carrying.
  if (statements.length === 0) {
    return containsPosition(scope, use) ? seed : [];
  }
  const scan: LiveScan = {
    name,
    use,
    atUse: [],
    broken: [],
    continued: [],
  };
  scanBlock(statements, seed, scan);
  return dedup(scan.atUse);
}

/**
 * Bindings `name` can be carrying at `use`, or an empty list when nothing in
 * the enclosing scopes binds it there.
 *
 * The innermost scope that binds the name answers for it, exactly as the
 * language resolves it, and a name bound nowhere reachable reads as unknown
 * rather than as nothing.
 */
function liveHere(name: string, scopes: ts.Node[], use: number): Binding[] {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const live = liveBindings(scopes[i]!, name, use);
    if (live.length > 0) return live;
  }
  return [];
}

/** The values among those bindings that are written where the name is bound. */
function liveValues(
  name: string,
  scopes: ts.Node[],
  use: number,
): ts.Expression[] | undefined {
  const live = liveHere(name, scopes, use);
  if (live.length === 0) return undefined;
  return live
    .map((binding) => binding.value)
    .filter((value): value is ts.Expression => value !== undefined);
}

/** Nodes belonging to a scope's own body, nested scopes not descended into. */
function ownNodes(body: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    found.push(node);
    if (opensScope(node)) return;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

/** Whether every path through a block leaves it rather than running past it. */
function alwaysEnds(statements: ts.Statement[]): boolean {
  for (const statement of statements) {
    if (terminates(statement)) return true;
    // A loop that runs no iterations falls straight through.
    if (isLoop(statement)) continue;
    const { bodies, trailing } = branchBodies(statement);
    if (trailing.length > 0 && alwaysEnds(trailing)) return true;
    if (bodies.length > 0 && bodies.every((body) => alwaysEnds(body))) {
      return true;
    }
  }
  return false;
}

/**
 * Expressions a function returns, or `undefined` when a call is not one of them.
 *
 * A generator returns a generator, an `async` function returns a promise, and a
 * bare `return` or a path running off the end returns nothing. In each the call
 * is not one of the expressions written here, so it resolves to nothing rather
 * than to the literals lying around in the body. Python's sibling reaches the
 * same place by following a plain `def` and no other spelling.
 */
function returnedValues(
  declaration: ts.FunctionDeclaration,
): ts.Expression[] | undefined {
  const body = declaration.body;
  const isAsync = declaration.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
  );
  if (!body || declaration.asteriskToken || isAsync) return undefined;
  const own = ownNodes(body);
  if (own.some((node) => ts.isYieldExpression(node))) return undefined;
  const returns = own.filter(ts.isReturnStatement);
  if (returns.some((statement) => !statement.expression)) return undefined;
  if (!alwaysEnds([...body.statements])) return undefined;
  return returns.map((statement) => statement.expression!);
}

/**
 * Codes a call to a top-level classifier can return.
 *
 * The `ADAPTER_BUG` / `STRANDS_ERROR` split lives in one function rather than
 * at each emission site, so the codes sit one call away from the frame that
 * carries them. Only a bare-name call to a single function declared at the top
 * level of the same source file is followed, and only through what it returns;
 * anything else stays unresolved and is counted.
 */
function resolveClassifierCall(
  node: ts.CallExpression,
  scopes: ts.Node[],
  seen: Set<ts.Node>,
): string[] | undefined {
  const called = calledName(node);
  const source = scopes[0];
  if (called === undefined || !source || !ts.isSourceFile(source)) {
    return undefined;
  }
  const declarations = source.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === called,
  );
  if (declarations.length !== 1) return undefined;
  const declaration = declarations[0]!;
  const values = returnedValues(declaration);
  if (!values || values.length === 0) return undefined;
  const found: string[] = [];
  for (const value of values) {
    const codes = resolveCode(value, [source, declaration], seen);
    if (!codes || codes.length === 0) return undefined;
    found.push(...codes);
  }
  return found;
}

/**
 * Code strings a node can evaluate to where it is written, or `undefined`.
 *
 * `undefined` whenever that cannot be shown, and every caller turns it into a
 * counted site rather than into nothing. A name whose live bindings include one
 * resolving to nothing leaves the whole site unresolved, never half read.
 * Parentheses and type assertions come off first, as they do everywhere else a
 * literal is read here.
 */
function resolveCode(
  node: ts.Expression | undefined,
  scopes: ts.Node[],
  seen: Set<ts.Node> = new Set(),
): string[] | undefined {
  if (!node || seen.has(node)) return undefined;
  const carried = new Set(seen).add(node);
  const expression = unwrap(node);
  if (isTextLiteral(expression)) {
    return CODE_LITERAL.test(expression.text) ? [expression.text] : undefined;
  }
  if (ts.isConditionalExpression(expression)) {
    const whenTrue = resolveCode(expression.whenTrue, scopes, carried);
    const whenFalse = resolveCode(expression.whenFalse, scopes, carried);
    if (!whenTrue || !whenFalse) return undefined;
    return [...whenTrue, ...whenFalse];
  }
  if (ts.isCallExpression(expression)) {
    return resolveClassifierCall(expression, scopes, carried);
  }
  if (!ts.isIdentifier(expression)) return undefined;
  const live = liveHere(expression.text, scopes, expression.getStart());
  if (live.length === 0) return undefined;
  const found: string[] = [];
  for (const binding of live) {
    const codes = resolveCode(binding.value, scopes, carried);
    if (!codes || codes.length === 0) return undefined;
    found.push(...codes);
  }
  return found;
}

/** The name a property is keyed by, when that key can be read statically. */
function propertyKey(
  property: ts.ObjectLiteralElementLike,
): string | undefined {
  const key = property.name;
  if (key === undefined) return undefined;
  if (ts.isIdentifier(key) || isTextLiteral(key)) return key.text;
  if (ts.isComputedPropertyName(key) && isTextLiteral(key.expression)) {
    return key.expression.text;
  }
  return undefined;
}

/**
 * One key looked up in an object literal.
 *
 * `present` says the literal spells the key out somewhere. `readable` says
 * nothing written after that spelling can still replace it.
 */
interface PropertyLookup {
  expression: ts.Expression | undefined;
  present: boolean;
  readable: boolean;
}

/**
 * A literal's value under a key, as the language evaluates the literal.
 *
 * A later property replaces an earlier one, so the last writing of the key is
 * what the literal holds. A spread or a computed key standing after it can
 * carry that key with anything in it, and a frame read off the rest would
 * report a code the site may never carry, so the entry reads as unreadable and
 * its site is counted instead. A spread standing before the key is replaced by
 * it and reads as it always did.
 */
function propertyValue(
  literal: ts.ObjectLiteralExpression,
  name: string,
): PropertyLookup {
  let found: PropertyLookup = {
    expression: undefined,
    present: false,
    readable: true,
  };
  for (const property of literal.properties) {
    const key = propertyKey(property);
    if (key === undefined) {
      found = { ...found, readable: false };
      continue;
    }
    if (key !== name) continue;
    if (ts.isPropertyAssignment(property)) {
      found = {
        expression: property.initializer,
        present: true,
        readable: true,
      };
    } else if (ts.isShorthandPropertyAssignment(property)) {
      // `{ message, code }` names the binding it stands for, so the shorthand
      // resolves exactly as the spelled-out form would.
      found = { expression: property.name, present: true, readable: true };
    } else {
      found = { expression: undefined, present: true, readable: true };
    }
  }
  return found;
}

/** A lookup's value, or nothing when something written after it can replace it. */
function readable(lookup: PropertyLookup): ts.Expression | undefined {
  return lookup.readable ? lookup.expression : undefined;
}

/** Whether an expression names the RUN_ERROR event type outright. */
function namesRunError(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) return node.name.text === RUN_ERROR;
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    return isTextLiteral(argument) && argument.text === RUN_ERROR;
  }
  return isTextLiteral(node) && node.text === RUN_ERROR;
}

/** Whether an expression states an event type plainly enough to be read. */
function statesEventType(node: ts.Expression): boolean {
  return (
    isTextLiteral(node) ||
    ts.isPropertyAccessExpression(node) ||
    (ts.isElementAccessExpression(node) &&
      isTextLiteral(node.argumentExpression))
  );
}

function mentionsRunError(node: ts.Node): boolean {
  if (namesRunError(node)) return true;
  let found = false;
  ts.forEachChild(node, (child) => {
    found = found || mentionsRunError(child);
  });
  return found;
}

type TypeEvidence = "names" | "other" | "hidden" | "absent";

/**
 * What an object literal's `type` property says about the frame it builds.
 *
 * A type states itself plainly as a bare string, a property access, or an
 * element access keyed by one, behind parentheses or a type assertion or not.
 * Anything else, an identifier included, hides it. A name could be followed to
 * the values live at the literal, but a name is only ever read to dismiss a
 * site, and a name read wrong, bound to a call or to an import, dismisses a
 * frame into neither track. No frame in this package is typed through one, so
 * following one buys no reading and is not worth that risk. A type something
 * written after it can still replace is read only far enough to recognise a
 * frame, never far enough to dismiss one, because what replaces it can be
 * RUN_ERROR.
 */
function typeEvidence(literal: ts.ObjectLiteralExpression): TypeEvidence {
  const type = propertyValue(literal, "type");
  if (!type.present) return "absent";
  if (!type.expression) return "hidden";
  const expression = unwrap(type.expression);
  if (!statesEventType(expression)) return "hidden";
  if (namesRunError(expression)) return "names";
  return type.readable ? "other" : "hidden";
}

/**
 * Whether an object literal builds a terminal error frame.
 *
 * A literal carrying a `type` is dismissed only when that type is read and
 * names something else. A type that cannot be read cannot be ruled out, so it
 * counts as a frame and is answered for either way, rather than falling out of
 * extraction unseen. A literal with no `type` property at all carries no
 * marker of its own: only a spread that can be traced back to RUN_ERROR, plus
 * a `code` of its own, qualifies one, so an ordinary object carrying a `code`
 * field stays out.
 */
function isRunErrorLiteral(
  literal: ts.ObjectLiteralExpression,
  scopes: ts.Node[],
): boolean {
  const evidence = typeEvidence(literal);
  if (evidence === "names") return true;
  if (evidence === "other") return false;
  // A type this cannot read is treated as a frame, but only when the literal
  // could carry a code at all. Without one it can contribute nothing to the
  // contract, and counting it would flag every unrelated literal in the
  // package whose type is computed.
  const carriesCode = propertyValue(literal, "code").present;
  if (evidence === "hidden") {
    return (
      carriesCode ||
      literal.properties.some(
        (property) =>
          ts.isSpreadAssignment(property) &&
          spreadCarriesRunError(property.expression, scopes),
      )
    );
  }
  if (!carriesCode) return false;
  return literal.properties.some(
    (property) =>
      ts.isSpreadAssignment(property) &&
      spreadCarriesRunError(property.expression, scopes),
  );
}

function spreadCarriesRunError(
  expression: ts.Expression,
  scopes: ts.Node[],
): boolean {
  if (mentionsRunError(expression)) return true;
  const source = unwrap(expression);
  if (!ts.isIdentifier(source)) return false;
  const bound = liveValues(source.text, scopes, source.getStart());
  return (bound ?? []).some(mentionsRunError);
}

/** Names in this source file that stand for `canonical`. */
function helperAliases(source: ts.SourceFile, canonical: string): Set<string> {
  const names = new Set([canonical]);
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node): void => {
      let alias: string | undefined;
      let target: string | undefined;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        alias = node.name.text;
        target = referencedName(node.initializer);
      } else if (ts.isImportSpecifier(node) && node.propertyName) {
        alias = node.name.text;
        target = node.propertyName.text;
      }
      if (alias && target && names.has(target) && !names.has(alias)) {
        names.add(alias);
        changed = true;
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
  }
  return names;
}

interface Builder {
  code: string;
  parameter: string;
  index: number;
  site: ts.Node;
}

/** What one module offers the others read alongside it. */
interface FileFacts {
  candidates: Map<string, Builder>;
  called: Set<string>;
  imported: Map<string, Imported>;
  namespaces: Map<string, string>;
  attributeCalls: Map<string, Set<string>>;
}

/**
 * What the other modules in the read set contribute to one module.
 *
 * `builders` and `namespaced` are the builders written elsewhere that this
 * module can call, keyed by the spelling it calls them under. `callers` names
 * this module's own builders that another module calls, so a builder whose
 * only callers are elsewhere is still answered for at them rather than
 * recorded where it is written.
 */
interface Foreign {
  builders: Map<string, Builder>;
  namespaced: Map<string, Builder>;
  callers: Set<string>;
}

function noForeign(): Foreign {
  return { builders: new Map(), namespaced: new Map(), callers: new Set() };
}

/** A named function under whatever spelling it is written in. */
interface NamedFunction {
  name: string;
  parameters: readonly ts.ParameterDeclaration[];
  body: ts.Node;
  scope: ts.Node;
}

interface HelperSignature {
  codeIndex: number | undefined;
  messageIndex: number | undefined;
}

/** A packed code and message, and the scope whose frame destructures them. */
interface UnpackedPair {
  codeIndex: number;
  messageIndex: number;
  owner: ts.Node;
}

interface FrameArguments {
  code: ts.Expression | undefined;
  message: ts.Expression | undefined;
}

/**
 * Parameter names in call order, a name that is a binding pattern held open as
 * an empty slot. Positions are counted over the whole list, so a destructured
 * parameter ahead of a named one cannot shift it.
 */
function parameterNames(
  parameters: readonly ts.ParameterDeclaration[],
): string[] {
  return parameters.map((parameter) =>
    ts.isIdentifier(parameter.name) ? parameter.name.text : "",
  );
}

/** Where a bare parameter reference sits in its own function's signature. */
function parameterSlot(
  node: ts.Expression | undefined,
  parameters: string[],
): number | undefined {
  if (!node) return undefined;
  const expression = unwrap(node);
  if (!ts.isIdentifier(expression)) return undefined;
  const index = parameters.indexOf(expression.text);
  return index < 0 ? undefined : index;
}

function extractFile(
  file: string,
  result: Extraction,
  foreign: Foreign = noForeign(),
): FileFacts {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const helpers = helperAliases(source, HELPER_NAME);

  /** The code and message of a recognised site, or `undefined` for anything else. */
  const frameArguments = (
    node: ts.Node,
    scopes: ts.Node[],
  ): FrameArguments | undefined => {
    if (
      ts.isCallExpression(node) &&
      helpers.has(referencedName(node.expression) ?? "")
    ) {
      if (!helperSignature) return { code: undefined, message: undefined };
      const signature = helperSignature;
      return {
        code:
          signature.codeIndex === undefined
            ? undefined
            : node.arguments[signature.codeIndex],
        message:
          signature.messageIndex === undefined
            ? undefined
            : node.arguments[signature.messageIndex],
      };
    }
    if (ts.isObjectLiteralExpression(node) && isRunErrorLiteral(node, scopes)) {
      const code = propertyValue(node, "code");
      const message = propertyValue(node, "message");
      // A field something written after it can replace is read as written
      // nowhere, which counts the site rather than recording a guess.
      if (!code.readable || !message.readable) {
        return { code: undefined, message: undefined };
      }
      return { code: code.expression, message: message.expression };
    }
    return undefined;
  };

  /**
   * Every named function in the file. A declaration and a function bound to a
   * name are one shape here, so a builder written as an arrow keeps the
   * sentences the `function` spelling keeps.
   */
  const namedFunctions = (): NamedFunction[] => {
    const found: NamedFunction[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        found.push({
          name: node.name.text,
          parameters: node.parameters,
          body: node.body,
          scope: node,
        });
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer))
      ) {
        found.push({
          name: node.name.text,
          parameters: node.initializer.parameters,
          body: node.initializer.body,
          scope: node.initializer,
        });
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
    return found;
  };

  const functions = namedFunctions();

  // A helper carries a frame's code and message through its own parameters, so
  // where those parameters sit is read off the helper's definition rather than
  // assumed. Reordering them then moves what a call site is read for instead
  // of quietly swapping the code and the message. Every name in the alias set
  // stands for that one definition, so the signature it yields answers for a
  // call written under any of them.
  const findHelperSignature = (): HelperSignature | undefined => {
    for (const candidate of functions) {
      if (!helpers.has(candidate.name)) continue;
      const parameters = parameterNames(candidate.parameters);
      let signature: HelperSignature | undefined;
      const visit = (node: ts.Node): void => {
        if (signature) return;
        if (
          ts.isObjectLiteralExpression(node) &&
          isRunErrorLiteral(node, [source])
        ) {
          signature = {
            codeIndex: parameterSlot(
              readable(propertyValue(node, "code")),
              parameters,
            ),
            messageIndex: parameterSlot(
              readable(propertyValue(node, "message")),
              parameters,
            ),
          };
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(candidate.body);
      if (signature) return signature;
    }
    return undefined;
  };

  const helperSignature = findHelperSignature();

  // A message literal that reaches the wire as an argument is pinned by
  // nothing unless the call site is followed into the builder. A named
  // function counts as a single-purpose builder when it holds exactly one
  // terminal frame, that frame's code resolves to exactly one literal, its
  // message is a bare reference to one of the function's own parameters. It
  // becomes a builder once something calls it, here or in another file the
  // extractor reads. Such a builder is recorded at its callers rather than
  // where it is written: each call contributes the template its message
  // argument renders to, so a reworded sentence fails here. An argument that
  // is not a literal renders to the placeholder, exactly as it would at a
  // direct construction site.
  const findBuilders = (): Map<string, Builder> => {
    const candidates = new Map<string, Builder>();
    for (const candidate of functions) {
      const inner = [source, candidate.scope];
      const sites: { node: ts.Node; args: FrameArguments }[] = [];
      const collect = (child: ts.Node): void => {
        const args = frameArguments(child, inner);
        if (args) sites.push({ node: child, args });
        ts.forEachChild(child, collect);
      };
      collect(candidate.body);
      const parameters = parameterNames(candidate.parameters);
      const only = sites.length === 1 ? sites[0]! : undefined;
      const codes = only ? resolveCode(only.args.code, inner) : undefined;
      const message = only?.args.message;
      if (
        only &&
        codes?.length === 1 &&
        message &&
        ts.isIdentifier(message) &&
        parameters.includes(message.text)
      ) {
        candidates.set(candidate.name, {
          code: codes[0]!,
          parameter: message.text,
          index: parameters.indexOf(message.text),
          site: only.node,
        });
      }
    }
    return candidates;
  };

  const candidates = findBuilders();
  const called = calledNames(source);
  const own = new Map(
    [...candidates].filter(
      ([name]) => called.has(name) || foreign.callers.has(name),
    ),
  );
  const builders = new Map([...own, ...foreign.builders]);
  const builderSites = new Set([...own.values()].map((b) => b.site));

  /** The builder a call reaches, under either spelling that can reach one. */
  const builderFor = (node: ts.CallExpression): Builder | undefined => {
    const bare = calledName(node);
    if (bare !== undefined) return builders.get(bare);
    const qualified = qualifiedCallee(node);
    if (!qualified) return undefined;
    return foreign.namespaced.get(`${qualified.qualifier}.${qualified.member}`);
  };

  // A code and its message can be packed into one pair and destructured at the
  // frame that writes them, which is the only place their pairing survives. A
  // pair is read here because a recognised construction site really does
  // destructure it into its code and message positions, never because of the
  // name it was given, and only inside the scope that destructures it, so an
  // unrelated pair of the same name records nothing.
  const findUnpackedPairs = (): Map<string, UnpackedPair> => {
    const pairs = new Map<string, UnpackedPair>();
    const sites: { code: string; message: string; at: number }[] = [];
    const collect = (node: ts.Node): void => {
      const args = frameArguments(node, [source]);
      if (args?.code && args.message) {
        const code = unwrap(args.code);
        const message = unwrap(args.message);
        if (ts.isIdentifier(code) && ts.isIdentifier(message)) {
          sites.push({
            code: code.text,
            message: message.text,
            at: node.getStart(),
          });
        }
      }
      ts.forEachChild(node, collect);
    };
    ts.forEachChild(source, collect);
    if (sites.length === 0) return pairs;
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isArrayBindingPattern(node.name) &&
        node.initializer
      ) {
        const packed = unwrap(node.initializer);
        const names = node.name.elements.map((element) =>
          ts.isBindingElement(element) && ts.isIdentifier(element.name)
            ? element.name.text
            : undefined,
        );
        if (ts.isIdentifier(packed)) {
          for (const site of sites) {
            if (node.getStart() > site.at) continue;
            const codeIndex = names.indexOf(site.code);
            const messageIndex = names.indexOf(site.message);
            if (codeIndex < 0 || messageIndex < 0) continue;
            pairs.set(packed.text, {
              codeIndex,
              messageIndex,
              owner: enclosingScope(node),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
    return pairs;
  };

  const unpackedPairs = findUnpackedPairs();
  const scopes: ts.Node[] = [source];

  /** A site is listed here at the moment one of the two tracks takes it. */
  const account = (node: ts.Node, resolved: boolean): void => {
    result.sites.push({ file, start: node.getStart(), resolved });
  };

  const record = (
    node: ts.Node,
    codeNode: ts.Expression | undefined,
    messageNode: ts.Expression | undefined,
  ): void => {
    const codes = resolveCode(codeNode, scopes);
    if (!codes) {
      result.unresolvedSites += 1;
      account(node, false);
      return;
    }
    account(node, true);
    for (const code of codes) {
      const bucket = result.messagesByCode.get(code) ?? new Set<string>();
      for (const message of renderMessage(messageNode)) bucket.add(message);
      result.messagesByCode.set(code, bucket);
    }
  };

  const recordBuilderCall = (
    builder: Builder,
    node: ts.CallExpression,
  ): void => {
    const argument = node.arguments[builder.index];
    const templates = argument ? renderMessage(argument) : [PLACEHOLDER];
    account(node, true);
    const bucket = result.messagesByCode.get(builder.code) ?? new Set<string>();
    for (const template of templates) bucket.add(template);
    result.messagesByCode.set(builder.code, bucket);
  };

  const recordPair = (node: ts.Node): void => {
    let name: string | undefined;
    let value: ts.Expression | undefined;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      name = node.name.text;
      value = node.initializer;
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      name = node.left.text;
      value = node.right;
    }
    const pair = name === undefined ? undefined : unpackedPairs.get(name);
    if (!pair || !value) return;
    if (!containsPosition(pair.owner, node.getStart())) return;
    const literal = unwrap(value);
    if (!ts.isArrayLiteralExpression(literal)) return;
    if (
      Math.max(pair.codeIndex, pair.messageIndex) >= literal.elements.length
    ) {
      return;
    }
    record(
      node,
      literal.elements[pair.codeIndex],
      literal.elements[pair.messageIndex],
    );
  };

  const walk = (node: ts.Node): void => {
    recordPair(node);
    // A builder is followed only where the call names it: by its own bare
    // name, or through the module alias its own file is bound to here. An
    // unrelated method that happens to share the trailing name carries none of
    // its sentences to the wire.
    const builder = ts.isCallExpression(node) ? builderFor(node) : undefined;
    if (builder) {
      recordBuilderCall(builder, node as ts.CallExpression);
    } else if (builderSites.has(node)) {
      // Answered for at its callers, where the sentences it carries are read.
      account(node, true);
    } else {
      const args = frameArguments(node, scopes);
      if (args) record(node, args.code, args.message);
    }

    const scoped = opensScope(node);
    if (scoped) scopes.push(node);
    ts.forEachChild(node, walk);
    if (scoped) scopes.pop();
  };
  ts.forEachChild(source, walk);

  return {
    candidates,
    called,
    imported: importedNames(file, source),
    namespaces: namespaceAliases(file, source),
    attributeCalls: attributeCalls(source),
  };
}

/** Names a file can write ahead of a member of the module `module`. */
function qualifiers(facts: FileFacts, module: string): string[] {
  return [...facts.namespaces]
    .filter(([, from]) => from === module)
    .map(([alias]) => alias);
}

/**
 * Builders the other read files lend one of them, and the ones it lends back.
 *
 * A builder's own frame is answered for at its callers, so a caller in another
 * read file has to be found: leaving it out drops the sentence it hands over
 * while the site it came from still reads as delegated.
 */
function foreignFor(file: string, facts: Map<string, FileFacts>): Foreign {
  const here = facts.get(file)!;
  const reached = noForeign();
  for (const [other, there] of facts) {
    if (other === file) continue;
    for (const [local, from] of here.imported) {
      const builder = there.candidates.get(from.name);
      if (from.module === other && builder)
        reached.builders.set(local, builder);
    }
    for (const qualifier of qualifiers(here, other)) {
      for (const [name, builder] of there.candidates) {
        reached.namespaced.set(`${qualifier}.${name}`, builder);
      }
    }
    for (const [local, from] of there.imported) {
      if (from.module === file && there.called.has(local)) {
        reached.callers.add(from.name);
      }
    }
    for (const qualifier of qualifiers(there, file)) {
      for (const name of there.attributeCalls.get(qualifier) ?? []) {
        reached.callers.add(name);
      }
    }
  }
  return reached;
}

export function extractSource(file: string): Extraction {
  const result = emptyExtraction();
  extractFile(file, result);
  return result;
}

/**
 * Codes and message templates found across the modules that build frames.
 *
 * The modules are read together rather than one at a time, so a builder
 * written in one of them and called in another is recorded at that call
 * instead of falling between the two files.
 */
export function extract(srcRoot: string = SRC_ROOT): Extraction {
  const files = SOURCE_FILES.map((name) => path.join(srcRoot, name));
  const facts = new Map(
    files.map((file): [string, FileFacts] => [
      file,
      extractFile(file, emptyExtraction()),
    ]),
  );
  const result = emptyExtraction();
  for (const file of files) {
    extractFile(file, result, foreignFor(file, facts));
  }
  return result;
}

/**
 * Text written as a string literal in the extracted modules.
 *
 * A comment carries no literal in the syntax tree, so a constant that survives
 * only in prose about the code does not answer for the code here. Python's
 * sibling excludes docstrings by hand to reach the same place. A template
 * literal's fragments count, as an f-string's do there.
 */
export function sourceStringLiterals(srcRoot: string = SRC_ROOT): Set<string> {
  const found = new Set<string>();
  for (const name of SOURCE_FILES) {
    const file = path.join(srcRoot, name);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const text of stringLiteralsWithin(source)) found.add(text);
  }
  return found;
}

/**
 * Whether a module calls a builder written in one of the read modules.
 *
 * Such a module carries sentences to the wire while writing no frame of its
 * own, so nothing about the frames it builds would give it away.
 */
function reachesABuilder(
  here: FileFacts,
  facts: Map<string, FileFacts>,
  file: string,
): boolean {
  for (const [other, there] of facts) {
    if (other === file) continue;
    for (const [local, from] of here.imported) {
      if (
        from.module === other &&
        here.called.has(local) &&
        there.candidates.has(from.name)
      ) {
        return true;
      }
    }
    for (const qualifier of qualifiers(here, other)) {
      for (const name of here.attributeCalls.get(qualifier) ?? []) {
        if (there.candidates.has(name)) return true;
      }
    }
  }
  return false;
}

/**
 * Package modules that build a terminal error frame, or reach one.
 *
 * Compared against `SOURCE_FILES`, this is what stops a third module from
 * being invisible to extraction simply by not being listed, whether it builds
 * a frame itself or only hands a sentence to a builder in a listed module.
 * `__tests__` is skipped: the suites there build error frames as expectations,
 * which the Python package has no equivalent of because its tests live outside
 * `src`.
 */
export function emittingFiles(srcRoot: string = SRC_ROOT): string[] {
  const facts = new Map(
    SOURCE_FILES.map((name): [string, FileFacts] => {
      const file = path.join(srcRoot, name);
      return [file, extractFile(file, emptyExtraction())];
    }),
  );
  const found: string[] = [];
  const visit = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__")
          visit(path.join(dir, entry.name), relative);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      const file = path.join(dir, entry.name);
      const probe = emptyExtraction();
      const here = extractFile(file, probe);
      if (probe.sites.length > 0 || reachesABuilder(here, facts, file)) {
        found.push(relative);
      }
    }
  };
  visit(srcRoot, "");
  return found;
}
