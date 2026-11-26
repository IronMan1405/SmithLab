import { describe, expect, it } from 'vitest';
import { abs, complex, reflectionFromAdmittance, reflectionFromImpedance } from '../src/core';
import {
  type ExpressionDef,
  createExpressionDef,
  defaultSlider,
  directDependents,
  evaluateExpressions,
  formatSliderValue,
  plottedGamma,
  sliderLiteral,
  withSliderValue,
} from '../src/expressions';
import { createWorkspace, workspaceReducer as reduce } from '../src/workspace';
import { expectComplexClose } from './helpers';

const def = (id: string, text: string, extra: Partial<ExpressionDef> = {}): ExpressionDef => ({
  ...createExpressionDef(id, text),
  ...extra,
});

const CHAIN = [
  def('zL', 'zL = 0.5 + j1.2'),
  def('gL', 'gammaL = (zL - 1)/(zL + 1)'),
  def('l', 'l = 0.125'),
  def('gIn', 'gammaIn = gammaL * exp(-j*4*pi*l)'),
  def('k', 'k = 3'),
];

function replace(list: readonly ExpressionDef[], id: string, text: string): ExpressionDef[] {
  return list.map((d) => (d.id === id ? { ...d, text } : d));
}

describe('dependency ordering', () => {
  it('evaluates in dependency order regardless of list order', () => {
    const reversed = [...CHAIN].reverse();
    const output = evaluateExpressions(reversed, 50);
    expect([...output.results.values()].every((r) => r.status === 'ok')).toBe(true);
    const pos = (id: string) => output.order.indexOf(id);
    expect(pos('zL')).toBeLessThan(pos('gL'));
    expect(pos('gL')).toBeLessThan(pos('gIn'));
    expect(pos('l')).toBeLessThan(pos('gIn'));
  });

  it('is deterministic', () => {
    expect(evaluateExpressions(CHAIN, 50).order).toEqual(evaluateExpressions(CHAIN, 50).order);
  });

  it('reports dependencies by name', () => {
    const output = evaluateExpressions(CHAIN, 50);
    expect(output.results.get('gIn')!.dependencies).toEqual(['gammaL', 'l']);
    expect(directDependents(output, 'zL')).toEqual(['gL']);
  });
});

describe('reactive re-evaluation', () => {
  it('changing a variable updates everything downstream', () => {
    const first = evaluateExpressions(CHAIN, 50);
    const second = evaluateExpressions(replace(CHAIN, 'l', 'l = 0.25'), 50, first);
    expectComplexClose(second.results.get('gIn')!.value!.value, complex(-first.results.get('gL')!.value!.value.re, -first.results.get('gL')!.value!.value.im), 1e-12);
  });

  it('recomputes only what is necessary', () => {
    const first = evaluateExpressions(CHAIN, 50);
    expect([...first.recomputed].sort()).toEqual(['gIn', 'gL', 'k', 'l', 'zL']);

    const lChanged = evaluateExpressions(replace(CHAIN, 'l', 'l = 0.2'), 50, first);
    expect([...lChanged.recomputed].sort()).toEqual(['gIn', 'l']);
    expect(lChanged.results.get('zL')).toBe(first.results.get('zL')); // reused object
    expect(lChanged.results.get('k')).toBe(first.results.get('k'));

    const zChanged = evaluateExpressions(replace(CHAIN, 'zL', 'zL = 2'), 50, first);
    expect([...zChanged.recomputed].sort()).toEqual(['gIn', 'gL', 'zL']);

    const nothing = evaluateExpressions(CHAIN, 50, first);
    expect(nothing.recomputed.size).toBe(0);
  });

  it('Z₀ changes recompute only expressions that use Z₀', () => {
    // ZL uses Z₀ for its chart position (Z/Z₀); zA converts with Z₀; zB and k don't.
    const list = [def('a', 'ZL = 100'), def('b', 'zA = z(ZL)'), def('c', 'zB = 0.5'), def('d', 'k = 2')];
    const at50 = evaluateExpressions(list, 50);
    const at25 = evaluateExpressions(list, 25, at50);
    expect([...at25.recomputed].sort()).toEqual(['a', 'b']);
    expect(at25.results.get('c')).toBe(at50.results.get('c'));
    expectComplexClose(at25.results.get('b')!.value!.value, complex(4, 0));
  });
});

describe('errors without crashing', () => {
  it('detects circular dependencies and reports the cycle', () => {
    const output = evaluateExpressions([def('a', 'a = b + 1'), def('b', 'b = c * 2'), def('c', 'c = a'), def('d', 'd = a + 1'), def('e', 'e = 5')], 50);
    for (const id of ['a', 'b', 'c']) {
      expect(output.results.get(id)!.error).toMatchObject({ kind: 'cycle' });
    }
    expect(output.results.get('a')!.error!.message).toBe('Circular dependency: a → b → c → a');
    expect(output.results.get('d')!.error).toMatchObject({ kind: 'dependency', message: '"a" has an error' });
    expect(output.results.get('e')!.status).toBe('ok');
  });

  it('detects self-reference', () => {
    const output = evaluateExpressions([def('a', 'x = x + 1')], 50);
    expect(output.results.get('a')!.error!.kind).toBe('cycle');
  });

  it('reports undefined references', () => {
    const output = evaluateExpressions([def('a', 'zL = zX + 1')], 50);
    expect(output.results.get('a')!.error).toMatchObject({ kind: 'reference', message: '"zX" is not defined' });
  });

  it('reports syntax errors, keeping other expressions working', () => {
    const output = evaluateExpressions([def('a', 'zL = (1 +'), def('b', 'k = 2 * 3')], 50);
    expect(output.results.get('a')!.error!.kind).toBe('syntax');
    expect(output.results.get('b')!.value!.value.re).toBe(6);
  });

  it('reports duplicate definitions and reserved names', () => {
    const output = evaluateExpressions([def('a', 'k = 1'), def('b', 'k = 2'), def('c', 'pi = 3'), def('d', 'm = k')], 50);
    expect(output.results.get('a')!.error!.message).toBe('"k" is defined 2 times');
    expect(output.results.get('b')!.error!.kind).toBe('name');
    expect(output.results.get('c')!.error!.message).toMatch(/built-in constant/);
    expect(output.results.get('d')!.error!.message).toBe('"k" is not defined');
  });

  it('disabled expressions are skipped and reported to dependents', () => {
    const list = replaceDef(CHAIN, 'l', { enabled: false });
    const output = evaluateExpressions(list, 50);
    expect(output.results.get('l')!.status).toBe('disabled');
    expect(output.results.get('gIn')!.error!.message).toBe('"l" is disabled');
  });

  it('empty expressions are neither errors nor values', () => {
    expect(evaluateExpressions([def('a', '  ')], 50).results.get('a')!.status).toBe('empty');
  });

  it('recovers when an error is fixed', () => {
    const broken = evaluateExpressions([def('a', 'zL = 2 +'), def('b', 'g = gamma(zL)')], 50);
    expect(broken.results.get('b')!.status).toBe('error');
    const fixed = evaluateExpressions([def('a', 'zL = 2'), def('b', 'g = gamma(zL)')], 50, broken);
    expectComplexClose(fixed.results.get('b')!.value!.value, complex(1 / 3, 0));
  });
});

function replaceDef(list: readonly ExpressionDef[], id: string, patch: Partial<ExpressionDef>): ExpressionDef[] {
  return list.map((d) => (d.id === id ? { ...d, ...patch } : d));
}

describe('deletion', () => {
  it('dependents of a deleted expression report an undefined reference; others are unaffected', () => {
    const first = evaluateExpressions(CHAIN, 50);
    const without = evaluateExpressions(CHAIN.filter((d) => d.id !== 'zL'), 50, first);
    expect(without.results.has('zL')).toBe(false);
    expect(without.results.get('gL')!.error!.message).toBe('"zL" is not defined');
    expect(without.results.get('gIn')!.error!.message).toBe('"gammaL" has an error');
    expect(without.results.get('l')).toBe(first.results.get('l'));
  });

  it('re-adding the definition restores the dependents', () => {
    const without = evaluateExpressions(CHAIN.filter((d) => d.id !== 'zL'), 50);
    const again = evaluateExpressions([def('zL2', 'zL = 0.5 + j1.2'), ...CHAIN.filter((d) => d.id !== 'zL')], 50, without);
    expect(again.results.get('gIn')!.status).toBe('ok');
  });
});

describe('chart coordinates', () => {
  it('plots impedance, admittance and reflection at their Γ', () => {
    const output = evaluateExpressions(
      [def('z', 'zL = 0.5 + j1.2'), def('y', 'yL = 0.5 + j1.2'), def('g', 'gammaL = 0.3 - j0.4'), def('Z', 'ZL = 25 + j60')],
      50,
    );
    expectComplexClose(plottedGamma(output.results.get('z'))!, reflectionFromImpedance(complex(0.5, 1.2)));
    expectComplexClose(plottedGamma(output.results.get('y'))!, reflectionFromAdmittance(complex(0.5, 1.2)));
    expectComplexClose(plottedGamma(output.results.get('g'))!, complex(0.3, -0.4));
    expectComplexClose(plottedGamma(output.results.get('Z'))!, reflectionFromImpedance(complex(0.5, 1.2)));
  });

  it('the impedance and admittance of one load plot at the same Γ', () => {
    // y = 1/z represents the same load, so it plots at the same Γ.
    const output = evaluateExpressions([def('z', 'zL = 2'), def('y', 'yL = 1/zL')], 50);
    expectComplexClose(plottedGamma(output.results.get('y'))!, plottedGamma(output.results.get('z'))!);
  });

  it('does not plot plain numbers, lengths, or points outside the chart', () => {
    const output = evaluateExpressions([def('a', 'k = 0.5 + j'), def('b', 'l = 0.1'), def('c', 'zA = -0.5 + j')], 50);
    expect(output.results.get('a')!.plot).toMatchObject({ kind: 'none', reason: expect.stringMatching(/Wrap it in z/) });
    expect(output.results.get('b')!.plot).toEqual({ kind: 'none', reason: null });
    expect(output.results.get('c')!.plot).toMatchObject({ kind: 'none', reason: expect.stringMatching(/Outside the chart/) });
    expect(plottedGamma(output.results.get('c'))).toBeNull();
  });

  it('plots boundary cases: open, short and lossless', () => {
    const output = evaluateExpressions([def('o', 'gammaO = 1'), def('s', 'zS = 0'), def('x', 'zX = j2')], 50);
    expectComplexClose(plottedGamma(output.results.get('o'))!, complex(1, 0));
    expectComplexClose(plottedGamma(output.results.get('s'))!, complex(-1, 0));
    expect(abs(plottedGamma(output.results.get('x'))!)).toBeCloseTo(1, 14);
  });

  it('physical impedance plots move when Z₀ changes', () => {
    const list = [def('Z', 'ZL = 100')];
    const at50 = evaluateExpressions(list, 50);
    const at100 = evaluateExpressions(list, 100, at50);
    expectComplexClose(plottedGamma(at50.results.get('Z'))!, complex(1 / 3, 0));
    expectComplexClose(plottedGamma(at100.results.get('Z'))!, complex(0, 0));
  });
});

describe('sliders', () => {
  it('recognises slider literals', () => {
    expect(sliderLiteral('l = 0.125')).toEqual({ name: 'l', value: 0.125 });
    expect(sliderLiteral('k = -3')).toEqual({ name: 'k', value: -3 });
    expect(sliderLiteral('k = 2 * 3')).toBeNull();
    expect(sliderLiteral('0.5')).toBeNull();
    expect(sliderLiteral('zL = j1')).toBeNull();
  });

  it('chooses sensible default ranges', () => {
    expect(defaultSlider('l', 0.125)).toEqual({ min: 0, max: 0.5, step: 0.001 });
    expect(defaultSlider('k', 3)).toEqual({ min: 0, max: 10, step: 0.01 });
    expect(defaultSlider('k', -0.3)).toEqual({ min: -1, max: 1, step: 0.001 });
  });

  it('rewrites the literal with step precision', () => {
    expect(withSliderValue('l = 0.125', 0.25, 0.001)).toBe('l = 0.25');
    expect(withSliderValue('l=0.1', 0.3330000001, 0.001)).toBe('l = 0.333');
    expect(withSliderValue('k = 2 * 3', 1, 0.1)).toBeNull();
    expect(formatSliderValue(-0.0001, 0.01)).toBe('0');
    expect(formatSliderValue(7, 1)).toBe('7');
  });

  it('slider-driven updates propagate through the chain', () => {
    let state = createWorkspace();
    for (const d of CHAIN) state = reduce(state, { type: 'expression/add', id: d.id, text: d.text });
    state = reduce(state, { type: 'expression/set-slider', id: 'l', slider: { min: 0, max: 0.5, step: 0.001 } });
    const before = evaluateExpressions(state.expressions, state.z0);

    const text = withSliderValue(state.expressions.find((e) => e.id === 'l')!.text, 0.25, 0.001)!;
    state = reduce(state, { type: 'expression/set-text', id: 'l', text });
    const after = evaluateExpressions(state.expressions, state.z0, before);

    expect([...after.recomputed].sort()).toEqual(['gIn', 'l']);
    const gL = before.results.get('gL')!.value!.value;
    expectComplexClose(plottedGamma(after.results.get('gIn'))!, complex(-gL.re, -gL.im), 1e-12);
  });
});

describe('workspace expression actions', () => {
  it('adds, edits, toggles and removes expressions with stable ids', () => {
    let s = createWorkspace();
    s = reduce(s, { type: 'expression/add', id: 'a', text: 'zL = 1' });
    s = reduce(s, { type: 'expression/add', id: 'c', text: 'k = 3' });
    s = reduce(s, { type: 'expression/add', id: 'b', text: 'y = 1', afterId: 'a' });
    expect(s.expressions.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    s = reduce(s, { type: 'expression/set-text', id: 'b', text: 'yL = 1/zL' });
    s = reduce(s, { type: 'expression/set-enabled', id: 'b', enabled: false });
    s = reduce(s, { type: 'expression/set-visible', id: 'a', visible: false });
    expect(s.expressions[1]).toMatchObject({ id: 'b', text: 'yL = 1/zL', enabled: false });
    expect(s.expressions[0]!.visible).toBe(false);
    s = reduce(s, { type: 'point/select', id: 'a' });
    expect(s.selectedId).toBe('a');
    s = reduce(s, { type: 'expression/remove', id: 'a' });
    expect(s.expressions.map((e) => e.id)).toEqual(['b', 'c']);
    expect(s.selectedId).toBeNull();
  });

  it('rejects invalid sliders and duplicate ids', () => {
    let s = reduce(createWorkspace(), { type: 'expression/add', id: 'a', text: 'k = 1' });
    expect(() => reduce(s, { type: 'expression/set-slider', id: 'a', slider: { min: 1, max: 0, step: 0.1 } })).toThrow(RangeError);
    expect(() => reduce(s, { type: 'expression/add', id: 'a' })).toThrow();
    s = reduce(s, { type: 'point/create', id: 'p', gamma: complex(0, 0) });
    expect(() => reduce(s, { type: 'expression/add', id: 'p' })).toThrow();
  });

  it('clearing points keeps expressions', () => {
    let s = reduce(createWorkspace(), { type: 'expression/add', id: 'a', text: 'zL = 1' });
    s = reduce(s, { type: 'point/create', id: 'p', gamma: complex(0.1, 0) });
    s = reduce(s, { type: 'points/clear' });
    expect(s.points).toEqual([]);
    expect(s.expressions).toHaveLength(1);
  });

  it('point actions do not move or delete expression points', () => {
    let s = reduce(createWorkspace(), { type: 'expression/add', id: 'a', text: 'zL = 1' });
    expect(reduce(s, { type: 'point/move', id: 'a', gamma: complex(0.5, 0) })).toBe(s);
    s = reduce(s, { type: 'point/delete', id: 'a' });
    expect(s.expressions).toHaveLength(1);
  });
});
