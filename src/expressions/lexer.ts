/**
 * Tokeniser for the expression language.
 *
 * Lexical rules
 * -------------
 * - Numbers: `12`, `0.5`, `.5`, `1e-3`, `2.5E6`.
 * - Imaginary literals: `j` immediately followed by a number (`j1.2`, `j.5`,
 *   `j2e3`) or a number immediately followed by `j` (`1.2j`). Consequently no
 *   identifier can be `j` followed by digits.
 * - Identifiers: a letter (any script, so `Γ` and `π` work) or `_`, then
 *   letters, digits or `_`.
 * - Operators: `+ - * / ^ ( ) , =`. The Unicode minus `−`, `×`, `·` and `÷`
 *   are accepted as their ASCII equivalents so displayed results can be
 *   pasted back in.
 * - Whitespace is ignored.
 */
import type { Span } from './ast';

export type Token =
  | { readonly kind: 'number' | 'imaginary'; readonly value: number; readonly span: Span }
  | { readonly kind: 'identifier'; readonly name: string; readonly span: Span }
  | { readonly kind: 'op'; readonly op: '+' | '-' | '*' | '/' | '^'; readonly span: Span }
  | { readonly kind: '(' | ')' | ',' | '=' | 'eof'; readonly span: Span };

export class SyntaxError extends Error {
  constructor(
    message: string,
    readonly span: Span,
  ) {
    super(message);
    this.name = 'SyntaxError';
  }
}

const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENT_START = /[\p{L}_]/u;
const IDENT_PART = /[\p{L}\p{N}_]/u;

const OPERATORS: Record<string, '+' | '-' | '*' | '/' | '^'> = {
  '+': '+',
  '-': '-',
  '−': '-',
  '*': '*',
  '×': '*',
  '·': '*',
  '/': '/',
  '÷': '/',
  '^': '^',
};

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // j<number> imaginary literal
    if (ch === 'j' && i + 1 < source.length && /[\d.]/.test(source[i + 1]!)) {
      const match = NUMBER.exec(source.slice(i + 1));
      if (match) {
        const end = i + 1 + match[0].length;
        if (end < source.length && IDENT_PART.test(source[end]!)) {
          throw new SyntaxError(`Unexpected "${source[end]}" after imaginary number`, { start: end, end: end + 1 });
        }
        tokens.push({ kind: 'imaginary', value: Number(match[0]), span: { start: i, end } });
        i = end;
        continue;
      }
    }

    const numberMatch = /[\d.]/.test(ch) ? NUMBER.exec(source.slice(i)) : null;
    if (numberMatch) {
      let end = i + numberMatch[0].length;
      const value = Number(numberMatch[0]);
      // <number>j imaginary literal
      if (source[end] === 'j' && !(end + 1 < source.length && IDENT_PART.test(source[end + 1]!))) {
        tokens.push({ kind: 'imaginary', value, span: { start: i, end: end + 1 } });
        i = end + 1;
        continue;
      }
      if (end < source.length && IDENT_PART.test(source[end]!)) {
        throw new SyntaxError(
          `Unexpected "${source[end]}" after number — write an explicit "*" for multiplication`,
          { start: end, end: end + 1 },
        );
      }
      tokens.push({ kind: 'number', value, span: { start: i, end } });
      i = end;
      continue;
    }

    if (IDENT_START.test(ch)) {
      let end = i + 1;
      while (end < source.length && IDENT_PART.test(source[end]!)) end++;
      tokens.push({ kind: 'identifier', name: source.slice(i, end), span: { start: i, end } });
      i = end;
      continue;
    }

    const op = OPERATORS[ch];
    if (op) {
      tokens.push({ kind: 'op', op, span: { start: i, end: i + 1 } });
      i++;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',' || ch === '=') {
      tokens.push({ kind: ch, span: { start: i, end: i + 1 } });
      i++;
      continue;
    }
    throw new SyntaxError(`Unexpected character "${ch}"`, { start: i, end: i + 1 });
  }
  tokens.push({ kind: 'eof', span: { start: source.length, end: source.length } });
  return tokens;
}
