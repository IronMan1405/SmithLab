import { describe, expect, it } from 'vitest';
import { type Node, parse, referencedNames, tokenize } from '../src/expressions';

/** Compact s-expression rendering of an AST, for precedence tests. */
function show(node: Node): string {
  switch (node.kind) {
    case 'number':
      return String(node.value);
    case 'imaginary':
      return `${node.value}j`;
    case 'identifier':
      return node.name;
    case 'unary':
      return `(${node.op} ${show(node.operand)})`;
    case 'binary':
      return `(${node.op} ${show(node.left)} ${show(node.right)})`;
    case 'call':
      return `${node.name}(${node.args.map(show).join(', ')})`;
  }
}

function body(source: string): string {
  const r = parse(source);
  if (!r.ok) throw new Error(r.message);
  return show(r.statement.body);
}

describe('tokenizer', () => {
  it('reads numbers, identifiers, operators and punctuation', () => {
    expect(tokenize('zL = 0.5 + 1e-3*(x)').map((t) => t.kind)).toEqual([
      'identifier', '=', 'number', 'op', 'number', 'op', '(', 'identifier', ')', 'eof',
    ]);
  });

  it('reads imaginary literals in both j1.2 and 1.2j forms', () => {
    const tokens = tokenize('j1.2 + 3j - j.5');
    expect(tokens.filter((t) => t.kind === 'imaginary').map((t) => (t.kind === 'imaginary' ? t.value : 0))).toEqual([1.2, 3, 0.5]);
  });

  it('treats a lone j as an identifier (the imaginary unit constant)', () => {
    expect(tokenize('-j*4')[1]).toMatchObject({ kind: 'identifier', name: 'j' });
  });

  it('accepts Greek letters and Unicode operators', () => {
    expect(tokenize('Γin = π − 1 × 2 ÷ 3').map((t) => (t.kind === 'op' ? t.op : t.kind))).toEqual([
      'identifier', '=', 'identifier', '-', 'number', '*', 'number', '/', 'number', 'eof',
    ]);
  });

  it('reports position of unexpected characters', () => {
    const r = parse('a = 2 $ 3');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.span).toEqual({ start: 6, end: 7 });
  });

  it('rejects implicit multiplication with a helpful message', () => {
    const r = parse('2pi');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/explicit "\*"/);
  });
});

describe('parser: statements', () => {
  it('parses assignments and bare expressions', () => {
    const a = parse('zL = 0.5 + j1.2');
    expect(a.ok && a.statement.name).toBe('zL');
    const b = parse('0.5 + j1.2');
    expect(b.ok && b.statement.name).toBeNull();
  });

  it('marks empty input as empty, not as an error', () => {
    const r = parse('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.empty).toBe(true);
  });

  it.each([
    ['zL =', /Missing expression/],
    ['1 +', /ends unexpectedly/],
    ['(1 + 2', /Expected "\)"/],
    ['1 + 2)', /Unexpected/],
    ['a = b = 1', /Only one "="/],
    ['f(1,', /ends unexpectedly/],
    ['*3', /Unexpected/],
  ])('rejects %s', (source, message) => {
    const r = parse(source);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.empty).toBe(false);
      expect(r.message).toMatch(message);
    }
  });
});

describe('parser: precedence and associativity', () => {
  it.each([
    ['1 + 2 * 3', '(+ 1 (* 2 3))'],
    ['(1 + 2) * 3', '(* (+ 1 2) 3)'],
    ['1 - 2 - 3', '(- (- 1 2) 3)'],
    ['8 / 4 / 2', '(/ (/ 8 4) 2)'],
    ['2 ^ 3 ^ 2', '(^ 2 (^ 3 2))'],
    ['-2 ^ 2', '(- (^ 2 2))'],
    ['2 ^ -1', '(^ 2 (- 1))'],
    ['a * -b', '(* a (- b))'],
    ['--a', '(- (- a))'],
    ['0.5 + j1.2', '(+ 0.5 1.2j)'],
    ['-j*4*pi*l', '(* (* (* (- j) 4) pi) l)'],
    ['(zL - 1)/(zL + 1)', '(/ (- zL 1) (+ zL 1))'],
    ['exp(-j*4*pi*l)', 'exp((* (* (* (- j) 4) pi) l))'],
    ['line(zL, 0.25) * 2', '(* line(zL, 0.25) 2)'],
  ])('%s → %s', (source, expected) => {
    expect(body(source)).toBe(expected);
  });
});

describe('references', () => {
  it('collects variable names but not function names', () => {
    const r = parse('gammaIn = gammaL * exp(-j*4*pi*l)');
    if (!r.ok) throw new Error(r.message);
    expect([...referencedNames(r.statement.body)].sort()).toEqual(['gammaL', 'j', 'l', 'pi']);
  });
});
