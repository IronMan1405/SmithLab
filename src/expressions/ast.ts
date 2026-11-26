/** Abstract syntax tree of the SmithLab expression language. */

export interface Span {
  /** Character offset of the first character (inclusive). */
  readonly start: number;
  /** Character offset after the last character (exclusive). */
  readonly end: number;
}

export type Node =
  | { readonly kind: 'number'; readonly value: number; readonly span: Span }
  | { readonly kind: 'imaginary'; readonly value: number; readonly span: Span }
  | { readonly kind: 'identifier'; readonly name: string; readonly span: Span }
  | { readonly kind: 'unary'; readonly op: '+' | '-'; readonly operand: Node; readonly span: Span }
  | {
      readonly kind: 'binary';
      readonly op: '+' | '-' | '*' | '/' | '^';
      readonly left: Node;
      readonly right: Node;
      readonly span: Span;
    }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Node[]; readonly span: Span };

/** One expression line: an optional `name =` assignment and a body. */
export interface Statement {
  readonly name: string | null;
  readonly nameSpan: Span | null;
  readonly body: Node;
}

/** Special forms whose arguments bind a local parameter: `curve(body, t, t0, t1)`. */
export const PARAMETRIC_FORMS: ReadonlySet<string> = new Set(['curve']);

/**
 * Names of variables referenced by a node (function names are not
 * included). Inside `curve(body, t, t0, t1)` the parameter `t` is local to
 * `body` and is not a reference.
 */
export function referencedNames(node: Node, into: Set<string> = new Set()): Set<string> {
  if (node.kind === 'call' && PARAMETRIC_FORMS.has(node.name) && node.args[1]?.kind === 'identifier') {
    const param = node.args[1].name;
    const inner = referencedNames(node.args[0]!, new Set());
    inner.delete(param);
    for (const name of inner) into.add(name);
    for (const arg of node.args.slice(2)) referencedNames(arg, into);
    return into;
  }
  switch (node.kind) {
    case 'identifier':
      into.add(node.name);
      break;
    case 'unary':
      referencedNames(node.operand, into);
      break;
    case 'binary':
      referencedNames(node.left, into);
      referencedNames(node.right, into);
      break;
    case 'call':
      for (const arg of node.args) referencedNames(arg, into);
      break;
    case 'number':
    case 'imaginary':
      break;
  }
  return into;
}
