/**
 * Recursive-descent parser.
 *
 * Grammar (lowest to highest precedence)
 * --------------------------------------
 *   statement := IDENT '=' expr | expr
 *   expr      := term (('+' | '-') term)*
 *   term      := unary (('*' | '/') unary)*
 *   unary     := ('+' | '-') unary | power
 *   power     := primary ('^' unary)?          right-associative
 *   primary   := NUMBER | IMAGINARY | IDENT '(' args? ')' | IDENT | '(' expr ')'
 *   args      := expr (',' expr)*
 *
 * So `-2^2 = -(2^2)`, `2^-1` is allowed, `2^3^2 = 2^(3^2)`, and there is no
 * implicit multiplication (write `2*pi`, not `2pi`).
 */
import type { Node, Span, Statement } from './ast';
import { SyntaxError, type Token, tokenize } from './lexer';

export type ParseResult =
  | { readonly ok: true; readonly statement: Statement }
  | { readonly ok: false; readonly empty: boolean; readonly message: string; readonly span: Span };

function join(a: Span, b: Span): Span {
  return { start: a.start, end: b.end };
}

function describe(token: Token): string {
  switch (token.kind) {
    case 'eof':
      return 'end of expression';
    case 'number':
    case 'imaginary':
      return 'a number';
    case 'identifier':
      return `"${token.name}"`;
    case 'op':
      return `"${token.op}"`;
    default:
      return `"${token.kind}"`;
  }
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== 'eof') this.index++;
    return token;
  }

  private expect(kind: Token['kind'], what: string): Token {
    const token = this.peek();
    if (token.kind !== kind) throw new SyntaxError(`Expected ${what} but found ${describe(token)}`, token.span);
    return this.next();
  }

  statement(): Statement {
    let name: string | null = null;
    let nameSpan: Span | null = null;
    const first = this.peek();
    if (first.kind === 'identifier' && this.peek(1).kind === '=') {
      name = first.name;
      nameSpan = first.span;
      this.next();
      this.next();
    }
    if (this.peek().kind === 'eof') {
      throw new SyntaxError(name ? `Missing expression after "${name} ="` : 'Empty expression', this.peek().span);
    }
    const body = this.expr();
    const rest = this.peek();
    if (rest.kind === '=') throw new SyntaxError('Only one "=" is allowed, as in "name = expression"', rest.span);
    if (rest.kind !== 'eof') throw new SyntaxError(`Unexpected ${describe(rest)}`, rest.span);
    return { name, nameSpan, body };
  }

  private expr(): Node {
    let left = this.term();
    for (;;) {
      const token = this.peek();
      if (token.kind !== 'op' || (token.op !== '+' && token.op !== '-')) return left;
      this.next();
      const right = this.term();
      left = { kind: 'binary', op: token.op, left, right, span: join(left.span, right.span) };
    }
  }

  private term(): Node {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (token.kind !== 'op' || (token.op !== '*' && token.op !== '/')) return left;
      this.next();
      const right = this.unary();
      left = { kind: 'binary', op: token.op, left, right, span: join(left.span, right.span) };
    }
  }

  private unary(): Node {
    const token = this.peek();
    if (token.kind === 'op' && (token.op === '+' || token.op === '-')) {
      this.next();
      const operand = this.unary();
      return { kind: 'unary', op: token.op, operand, span: join(token.span, operand.span) };
    }
    return this.power();
  }

  private power(): Node {
    const base = this.primary();
    const token = this.peek();
    if (token.kind === 'op' && token.op === '^') {
      this.next();
      const exponent = this.unary();
      return { kind: 'binary', op: '^', left: base, right: exponent, span: join(base.span, exponent.span) };
    }
    return base;
  }

  private primary(): Node {
    const token = this.next();
    switch (token.kind) {
      case 'number':
        return { kind: 'number', value: token.value, span: token.span };
      case 'imaginary':
        return { kind: 'imaginary', value: token.value, span: token.span };
      case 'identifier': {
        if (this.peek().kind !== '(') return { kind: 'identifier', name: token.name, span: token.span };
        this.next();
        const args: Node[] = [];
        if (this.peek().kind !== ')') {
          args.push(this.expr());
          while (this.peek().kind === ',') {
            this.next();
            args.push(this.expr());
          }
        }
        const close = this.expect(')', `")" to close ${token.name}(`);
        return { kind: 'call', name: token.name, args, span: join(token.span, close.span) };
      }
      case '(': {
        const inner = this.expr();
        this.expect(')', '")"');
        return inner;
      }
      default:
        throw new SyntaxError(
          token.kind === 'eof' ? 'Expression ends unexpectedly' : `Unexpected ${describe(token)}`,
          token.span,
        );
    }
  }
}

export function parse(source: string): ParseResult {
  if (source.trim() === '') return { ok: false, empty: true, message: 'Empty expression', span: { start: 0, end: 0 } };
  try {
    return { ok: true, statement: new Parser(tokenize(source)).statement() };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, empty: false, message: error.message, span: error.span };
    throw error;
  }
}

const cache = new Map<string, ParseResult>();
const CACHE_LIMIT = 2000;

/** `parse` with a bounded memo: unchanged text is never re-parsed. */
export function parseCached(source: string): ParseResult {
  const hit = cache.get(source);
  if (hit) return hit;
  if (cache.size >= CACHE_LIMIT) cache.clear();
  const result = parse(source);
  cache.set(source, result);
  return result;
}
