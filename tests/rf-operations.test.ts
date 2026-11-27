import { describe, expect, it } from 'vitest';
import {
  type Complex,
  abs,
  add,
  admittanceFromImpedance,
  complex,
  impedanceFromAdmittance,
  reflectionFromImpedance,
} from '../src/core';
import {
  type ExpressionDef,
  type ExpressionResult,
  createExpressionDef,
  evaluateExpressions,
  plottedGamma,
  withSliderValue,
} from '../src/expressions';
import { displayCurve } from '../src/geometry';
import { expectComplexClose } from './helpers';

let n = 0;
const def = (text: string, extra: Partial<ExpressionDef> = {}): ExpressionDef => ({ ...createExpressionDef(`d${++n}`, text), ...extra });

function run(lines: readonly string[], z0 = 50) {
  return [...evaluateExpressions(lines.map((t) => def(t)), z0).results.values()];
}

function ok(r: ExpressionResult) {
  if (r.status !== 'ok' || !r.value) throw new Error(`${r.name}: ${r.status} ${r.error?.message}`);
  return r.value;
}

/** Value and type of the last line. */
function last(lines: readonly string[], z0 = 50) {
  return ok(run(lines, z0).at(-1)!);
}

function err(lines: readonly string[], z0 = 50) {
  const r = run(lines, z0).at(-1)!;
  expect(r.status).toBe('error');
  return r.error!.message;
}

describe('series and shunt: definitions', () => {
  it('series(z, e) = z + e and shunt(y, e) = y + e', () => {
    for (const [z, e] of [[complex(0.5, 1.2), complex(0, 0.5)], [complex(2, 0), complex(0.3, -0.7)], [complex(0.1, -3), complex(0, -1)]] as const) {
      const zs = `${z.re} + j*${z.im}`;
      const es = `${e.re} + j*${e.im}`;
      expectComplexClose(last([`zA = ${zs}`, `series(zA, ${es})`]).value, add(z, e));
      expectComplexClose(last([`yA = ${zs}`, `shunt(yA, ${es})`]).value, add(z, e));
    }
  });

  it('agree with existing operator arithmetic', () => {
    expectComplexClose(last(['zA = 0.5 + j1.2', 'series(zA, j0.5)']).value, last(['zA = 0.5 + j1.2', 'zA + j0.5']).value);
    expectComplexClose(last(['yA = 0.5 + j1.2', 'shunt(yA, j0.5)']).value, last(['yA = 0.5 + j1.2', 'yA + j0.5']).value);
    expectComplexClose(last(['ZA = 100 + j50', 'series(ZA, Z(-j20))']).value, last(['ZA = 100 + j50', 'ZA + Z(-j20)']).value);
  });

  it('shunt on an impedance: z_out = 1/(1/z + e)', () => {
    const z = complex(0.7, -0.4);
    const expected = impedanceFromAdmittance(add(admittanceFromImpedance(z), complex(0, 0.8)));
    expectComplexClose(last(['zA = 0.7 - j0.4', 'shunt(zA, j0.8)']).value, expected, 1e-14);
  });

  it('series on an admittance: y_out = 1/(1/y + e)', () => {
    const y = complex(0.3, 0.9);
    const expected = admittanceFromImpedance(add(impedanceFromAdmittance(y), complex(0, -0.6)));
    expectComplexClose(last(['yA = 0.3 + j0.9', 'series(yA, -j0.6)']).value, expected, 1e-14);
  });
});

describe('result keeps the type of the point', () => {
  it.each([
    ['zA = 0.5 + j1.2', 'zA', 'j0.5', 'impedance'],
    ['yA = 0.5 + j1.2', 'yA', 'j0.5', 'admittance'],
    ['gammaA = 0.3 + j0.4', 'gammaA', 'j0.5', 'reflection'],
    ['ZA = 25 + j60', 'ZA', 'Z(j25)', 'physicalImpedance'],
  ] as const)('%s', (line, name, element, type) => {
    expect(last([line, `series(${name}, ${element})`]).type).toBe(type);
    expect(last([line, `shunt(${name}, ${element})`]).type).toBe(type);
  });

  it('all four representations of one load give the same chart point', () => {
    const load = ['zB = 0.5 + j1.2', 'yB = 1/zB', 'gammaB = gamma(zB)', 'ZB = Z(zB)'];
    const gammaOf = (expr: string) => plottedGamma(run([...load, `p = ${expr}`]).at(-1)!)!;
    const reference = gammaOf('shunt(series(zB, -j0.4), j0.3)');
    expectComplexClose(gammaOf('shunt(series(yB, -j0.4), j0.3)'), reference, 1e-13);
    expectComplexClose(gammaOf('shunt(series(gammaB, -j0.4), j0.3)'), reference, 1e-13);
    // In ohms the elements must be typed: z(…) normalized, y(…) normalized admittance.
    expectComplexClose(gammaOf('shunt(series(ZB, z(-j0.4)), y(j0.3))'), reference, 1e-12);
  });

  it('chains without 1/z steps match the brief example', () => {
    const brief = run(['zL = 0.5 + j1.2', 'z1 = line(zL, 0.125)', 'y1 = 1/z1', 'y2 = y1 + j0.5', 'z2 = 1/y2']).at(-1)!;
    const chain = run(['zL = 0.5 + j1.2', 'z1 = line(zL, 0.125)', 'z2 = shunt(z1, j0.5)']).at(-1)!;
    expect(chain.value!.type).toBe('impedance');
    expectComplexClose(chain.value!.value, brief.value!.value, 1e-13);
    expectComplexClose(chain.value!.value, complex(0.44395, -1.4362), 1e-4);
  });
});

describe('element typing', () => {
  it('plain elements are normalized in the operation domain', () => {
    expectComplexClose(last(['zA = 1', 'series(zA, 0.2)']).value, complex(1.2, 0)); // series resistor
    expectComplexClose(last(['zA = 1', 'shunt(zA, 1)']).value, complex(0.5, 0)); // shunt conductance g = 1
  });

  it('typed elements from the other domain are converted', () => {
    // series with an element given as admittance y = −j2 → z = j0.5
    expectComplexClose(last(['zA = 1', 'series(zA, y(-j2))']).value, complex(1, 0.5));
    // shunt with an element given as impedance z = −j2 → y = j0.5
    expectComplexClose(last(['zA = 2', 'shunt(zA, z(-j2))']).value, complex(1, -1));
  });

  it('elements in ohms are normalized by Z₀', () => {
    expectComplexClose(last(['zA = 1', 'series(zA, Z(j25))'], 50).value, complex(1, 0.5));
    expectComplexClose(last(['zA = 1', 'series(zA, Z(j25))'], 25).value, complex(1, 1));
    // shunt element of −j100 Ω at Z₀ = 50: y = 50/(−j100) = j0.5
    expectComplexClose(last(['zA = 2', 'shunt(zA, Z(-j100))']).value, complex(1, -1));
  });

  it('physical points with physical or normalized typed elements', () => {
    expectComplexClose(last(['ZA = 100 + j50', 'series(ZA, Z(-j50))']).value, complex(100, 0));
    expectComplexClose(last(['ZA = 100 + j50', 'series(ZA, z(-j1))']).value, complex(100, 0)); // −j1·50 Ω
    // shunt of 100 Ω with Z(100): two 100 Ω in parallel = 50 Ω
    expectComplexClose(last(['ZA = 100', 'shunt(ZA, Z(100))']).value, complex(50, 0), 1e-12);
  });

  it('rejects ambiguous plain elements on physical points, suggesting Z(…) or z(…)', () => {
    for (const op of ['series', 'shunt']) {
      const message = err(['ZA = 100 + j50', `${op}(ZA, j10)`]);
      expect(message).toMatch(/ambiguous/);
      expect(message).toMatch(/Z\(…\)/);
      expect(message).toMatch(/z\(…\)/);
    }
  });

  it('rejects elements without a circuit meaning', () => {
    expect(err(['zA = 1', 'gammaE = 0.5', 'series(zA, gammaE)'])).toMatch(/element must be an impedance, admittance or plain number, not a reflection coefficient/);
    expect(err(['zA = 1', 'lE = 0.1', 'shunt(zA, lE)'])).toMatch(/not an electrical length/);
    expect(err(['zA = 1', 'series(zA, rCircle(1))'])).toMatch(/expects a number, not a curve/);
  });

  it('rejects points without a chart meaning', () => {
    expect(err(['series(0.5 + j1, j0.5)'])).toMatch(/wrap the number in z\(…\)/);
    expect(err(['lP = 0.2', 'shunt(lP, j0.5)'])).toMatch(/needs an impedance, admittance or reflection coefficient/);
    expect(err(['series(rCircle(1), j0.5)'])).toMatch(/expects a number, not a curve/);
  });

  it('checks argument count', () => {
    expect(err(['series(z(1))'])).toMatch(/takes 2 arguments/);
  });
});

describe('textbook cases and identities', () => {
  it('L-network: z = 2 → shunt j0.5 → series j1 gives an exact match', () => {
    expectComplexClose(last(['zA = 2', 'zB = shunt(zA, j0.5)', 'series(zB, j1)']).value, complex(1, 0), 1e-14);
    expectComplexClose(last(['zA = 2', 'zB = shunt(zA, -j0.5)', 'series(zB, -j1)']).value, complex(1, 0), 1e-14);
  });

  it('adding and removing the same element is the identity', () => {
    for (const p of ['zA = 0.3 - j1.7', 'yA = 2 + j0.1', 'gammaA = -0.4 + j0.5', 'ZA = 12 + j80']) {
      const name = p.split(' ')[0]!;
      const e = name === 'ZA' ? 'Z(j33)' : 'j0.37';
      const ne = name === 'ZA' ? 'Z(-j33)' : '-j0.37';
      const original = last([p]);
      expectComplexClose(last([p, `series(series(${name}, ${e}), ${ne})`]).value, original.value, 1e-12);
      expectComplexClose(last([p, `shunt(shunt(${name}, ${e}), ${ne})`]).value, original.value, 1e-12);
    }
  });

  it('a pure reactance keeps r (series) or g (shunt), so the point stays on its circle', () => {
    const z = last(['zA = 0.6 + j0.8', 'series(zA, j0.7)']).value;
    expect(z.re).toBeCloseTo(0.6, 14);
    const y = last(['yA = 0.6 + j0.8', 'shunt(yA, -j0.3)']).value;
    expect(y.re).toBeCloseTo(0.6, 14);
    const zShunt = last(['zA = 0.6 + j0.8', 'shunt(zA, j0.3)']).value;
    expect(admittanceFromImpedance(zShunt).re).toBeCloseTo(admittanceFromImpedance(complex(0.6, 0.8)).re, 14);
  });

  it('shorted stub by composition: shunt(x, y(line(z(0), l)))', () => {
    // A shorted λ/8 stub has z = j1, so y = −j1.
    const viaStub = last(['zA = 0.4 - j0.3', 'shunt(zA, y(line(z(0), 0.125)))']).value;
    const direct = last(['zA = 0.4 - j0.3', 'shunt(zA, -j1)']).value;
    expectComplexClose(viaStub, direct, 1e-12);
  });
});

describe('edge cases', () => {
  it('open stays open under a series element; short stays short under a shunt element', () => {
    expectComplexClose(last(['gammaO = 1', 'series(gammaO, j0.5)']).value, complex(1, 0));
    expectComplexClose(last(['gammaS = -1', 'shunt(gammaS, j0.5)']).value, complex(-1, 0));
  });

  it('series on a short and shunt on an open give the element itself', () => {
    expectComplexClose(last(['gammaS = -1', 'zS = z(gammaS)', 'series(zS, j0.5)']).value, complex(0, 0.5));
    expectComplexClose(last(['gammaO = 1', 'yO = y(gammaO)', 'shunt(yO, j0.5)']).value, complex(0, 0.5));
  });

  it('a short-circuit shunt element shorts the point; an open series element opens it', () => {
    expectComplexClose(plottedGamma(run(['zA = 0.5 + j0.5', 'p = shunt(zA, z(0))']).at(-1)!)!, complex(-1, 0));
    expectComplexClose(plottedGamma(run(['zA = 0.5 + j0.5', 'p = series(zA, y(0))']).at(-1)!)!, complex(1, 0));
  });

  it('matched point', () => {
    expectComplexClose(last(['zA = 1', 'series(zA, 0)']).value, complex(1, 0));
    expectComplexClose(last(['gammaA = 0', 'shunt(gammaA, j1)']).value, reflectionFromImpedance(impedanceFromAdmittance(complex(1, 1))), 1e-14);
  });

  it('negative resistance leaves the chart and is reported, not plotted', () => {
    const r = run(['zA = 0.2', 'p = series(zA, -0.5)']).at(-1)!;
    expect(r.status).toBe('ok');
    expect(r.plot).toMatchObject({ kind: 'none', reason: expect.stringMatching(/Outside the chart/) });
  });

  it('indeterminate results are errors', () => {
    // open (z = ∞) in series with an "open" element given as y(0) (z = ∞) is ∞ + ∞, still open → fine;
    // but ∞ − ∞ is undefined:
    expect(err(['gammaO = 1', 'zO = z(gammaO)', 'series(zO, -z(gammaO))'])).toMatch(/undefined|indeterminate/);
  });
});

describe('reactivity and evaluation', () => {
  const chain = () => [
    def('zM = 2'),
    def('bM = 0.5', { slider: { min: -2, max: 2, step: 0.01 } }),
    def('xM = 1', { slider: { min: -2, max: 2, step: 0.01 } }),
    def('zM1 = shunt(zM, j*bM)'),
    def('zM2 = series(zM1, j*xM)'),
    def('kOther = 3'),
  ];

  it('a slider change recomputes only its dependents', () => {
    const list = chain();
    const first = evaluateExpressions(list, 50);
    expectComplexClose(first.results.get(list[4]!.id)!.value!.value, complex(1, 0), 1e-14);
    const moved = list.map((d, i) => (i === 2 ? { ...d, text: withSliderValue(d.text, 0.5, 0.01)! } : d));
    const second = evaluateExpressions(moved, 50, first);
    expect([...second.recomputed].sort()).toEqual([list[2]!.id, list[4]!.id].sort());
    expectComplexClose(second.results.get(list[4]!.id)!.value!.value, complex(1, -0.5), 1e-14);
  });

  it('upstream changes propagate through the chain', () => {
    const list = chain();
    const first = evaluateExpressions(list, 50);
    const changed = list.map((d, i) => (i === 0 ? { ...d, text: 'zM = 0.5' } : d));
    const second = evaluateExpressions(changed, 50, first);
    expect(second.recomputed.has(list[3]!.id) && second.recomputed.has(list[4]!.id)).toBe(true);
    expect(second.recomputed.has(list[5]!.id)).toBe(false);
  });

  it('Z₀ changes recompute exactly the operations that use Z₀', () => {
    const list = [def('ZA = 100 + j50'), def('ZB = series(ZA, Z(-j50))'), def('zC = 2'), def('zD = series(zC, Z(j25))'), def('zE = series(zC, j0.5)')];
    const at50 = evaluateExpressions(list, 50);
    const at25 = evaluateExpressions(list, 25, at50);
    const ids = list.map((d) => d.id);
    expect([...at25.recomputed].sort()).toEqual([ids[0], ids[1], ids[3]].sort()); // ZA plots via Z₀; zE and zC do not use Z₀
    expectComplexClose(at25.results.get(ids[3]!)!.value!.value, complex(2, 1)); // j25 Ω at Z₀ = 25 is j1
    expectComplexClose(at25.results.get(ids[1]!)!.value!.value, complex(100, 0)); // ohms are unchanged by Z₀
  });

  it('disabled and failing inputs propagate as errors', () => {
    const out = evaluateExpressions([def('zA = 2', { enabled: false }), def('zB = series(zA, j1)'), def('zC = shunt(zQ, j1)')], 50);
    const [, b, c] = [...out.results.values()];
    expect(b!.error!.message).toBe('"zA" is disabled');
    expect(c!.error!.message).toBe('"zQ" is not defined');
  });

  it('works inside curve(): sweeping a series reactance traces the constant-r circle', () => {
    const out = run(['zA = 0.6 + j0.8', 'c = curve(series(zA, j*t), t, -2, 2)']);
    const curve = out.at(-1)!.curve!;
    expect(curve.kind).toBe('parametric');
    for (const t of [-2, -0.5, 0, 1.3, 2]) {
      const g = curve.point(t)!;
      expectComplexClose(g, reflectionFromImpedance(complex(0.6, 0.8 + t)), 1e-13);
      // on the r = 0.6 circle: centre 0.6/1.6, radius 1/1.6
      expect(abs({ re: g.re - 0.375, im: g.im } as Complex)).toBeCloseTo(0.625, 13);
    }
  });

  it('shunt sweeps trace the constant-g circle (drawn on the admittance grid in admittance mode)', () => {
    const curve = run(['yA = 0.5 + j0.2', 'c = curve(shunt(yA, j*t), t, -1, 1)']).at(-1)!.curve!;
    expect(curve).toMatchObject({ frame: 'number', domain: 'admittance' });
    const shown = displayCurve(curve, 'admittance');
    for (const t of [-1, 0, 0.7]) {
      const g = shown.point(t)!;
      expect(abs({ re: g.re + 1 / 3, im: g.im } as Complex)).toBeCloseTo(2 / 3, 13); // g = 0.5 circle: centre −1/3, radius 2/3
      const k = curve.point(t)!; // canonical: on the r = 0.5 circle (y numbers read on the Z grid)
      expect(abs({ re: k.re - 1 / 3, im: k.im } as Complex)).toBeCloseTo(2 / 3, 13);
    }
  });
});
