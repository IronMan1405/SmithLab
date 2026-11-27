import { describe, expect, it } from 'vitest';
import { type Complex, abs, add, arg, complex, div, reflectionFromImpedance, sub } from '../src/core';
import {
  type ExpressionDef,
  type ExpressionResult,
  createExpressionDef,
  evaluateExpressions,
  withSliderValue,
} from '../src/expressions';
import { type Shape, applyMobius, displayCurve, mobius, realIntervalImage, realLineImage } from '../src/geometry';
import type { Curve } from '../src/geometry/curves';
import { curvePath } from '../src/chart/curve-paths';
import { shapeToPath } from '../src/chart/svg-path';
import { expectComplexClose } from './helpers';

let n = 0;
const def = (text: string): ExpressionDef => createExpressionDef(`s${++n}`, text);
const run = (lines: readonly string[], z0 = 50) => [...evaluateExpressions(lines.map(def), z0).results.values()];
function ok(r: ExpressionResult) {
  if (r.status !== 'ok') throw new Error(`${r.name}: ${r.status} ${r.error?.message}`);
  return r;
}
const lastR = (lines: readonly string[], z0 = 50) => ok(run(lines, z0).at(-1)!);
const value = (lines: readonly string[], z0 = 50) => {
  const v = lastR(lines, z0).value;
  if (!v) throw new Error('not a value');
  return v;
};
const curveOf = (lines: readonly string[], z0 = 50): Curve => {
  const c = lastR(lines, z0).curve;
  if (!c) throw new Error('not a curve');
  return c;
};
function err(lines: readonly string[], z0 = 50) {
  const r = run(lines, z0).at(-1)!;
  expect(r.status).toBe('error');
  return r.error!.message;
}

/** Signed angular position of p along an arc, in [0, |sweep|] when on it. */
function alongArc(shape: Shape, p: Complex): number {
  if (shape.kind !== 'arc') throw new Error('not an arc');
  expect(abs(sub(p, shape.center))).toBeCloseTo(shape.radius, 10);
  const d = arg(sub(p, shape.center)) - shape.startAngle;
  const s = Math.sign(shape.sweep);
  return ((((s * d) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
}

function expectOnShape(c: Curve, ts: readonly number[]) {
  const shape = c.shape!;
  for (const t of ts) {
    const p = c.point(t)!;
    if (shape.kind === 'arc') expect(alongArc(shape, p)).toBeLessThanOrEqual(Math.abs(shape.sweep) + 1e-12);
    else if (shape.kind === 'segment') {
      const d = sub(shape.end, shape.start);
      const cross = d.re * (p.im - shape.start.im) - d.im * (p.re - shape.start.re);
      expect(Math.abs(cross)).toBeLessThan(1e-12);
    }
  }
}

describe('Möbius real-interval images', () => {
  it('closed-form circle passes through every image point', () => {
    const m = mobius(complex(0.3, 1), complex(-1, 0.2), complex(0.5, -0.7), complex(2, 1));
    const img = realLineImage(m);
    expect(img.kind).toBe('circle');
    if (img.kind !== 'circle') return;
    for (const t of [-10, -1, 0, 0.3, 2, 50]) expect(abs(sub(applyMobius(m, t), img.center))).toBeCloseTo(img.radius, 12);
  });

  it('a real pole or an affine map gives a line (segment)', () => {
    expect(realLineImage(mobius(complex(1, 1), complex(0, 0), complex(0, 0), complex(1, 0))).kind).toBe('line');
    expect(realLineImage(mobius(complex(0, 1), complex(1, 0), complex(1, 0), complex(-2, 0))).kind).toBe('line');
    expect(realIntervalImage(mobius(complex(1, 1), complex(0, 0), complex(0, 0), complex(1, 0)), 0, 1).kind).toBe('segment');
  });

  it('arc runs from M(t0) to M(t1) through the image of the interior, in both directions', () => {
    const m = mobius(complex(0.3, 1), complex(-1, 0.2), complex(0.5, -0.7), complex(2, 1));
    for (const [t0, t1] of [[0, 3], [3, 0], [-1, 0.5]] as const) {
      const s = realIntervalImage(m, t0, t1);
      if (s.kind !== 'arc') throw new Error('expected arc');
      expectComplexClose(s.start, applyMobius(m, t0));
      expectComplexClose(s.end, applyMobius(m, t1));
      for (const f of [0.1, 0.5, 0.9]) expect(alongArc(s, applyMobius(m, t0 + f * (t1 - t0)))).toBeLessThan(Math.abs(s.sweep));
    }
  });

  it('a tiny interval is a tiny arc, never a full circle', () => {
    const m = mobius(complex(0.3, 1), complex(-1, 0.2), complex(0.5, -0.7), complex(2, 1));
    for (const w of [1e-9, 1e-13, 1e-16]) {
      const s = realIntervalImage(m, 1, 1 + w);
      expect(s.kind).not.toBe('circle');
      if (s.kind === 'arc') expect(Math.abs(s.sweep)).toBeLessThan(1e-6);
    }
  });

  it('rejects an interval containing the pole', () => {
    expect(() => realIntervalImage(mobius(complex(1, 0), complex(0, 0), complex(1, 0), complex(-1, 0)), 0, 2)).toThrow(/pole/);
  });
});

describe('seriesPath / shuntPath: agree with series() / shunt()', () => {
  const points = ['zP = 0.4 + j0.7', 'yP = 0.6 - j0.3', 'gammaP = 0.2 - j0.5', 'ZP = 30 + j40'];
  const ts = [-1.5, -0.4, 0, 0.25, 1, 2];

  it('every parameter value is the operation applied to that element (all point types)', () => {
    for (const p of points.slice(0, 3)) {
      const name = p.split(' ')[0]!;
      for (const t of ts) {
        for (const op of ['series', 'shunt'] as const) {
          const at = value([p, `c = ${op}Path(${name}, -j2, j2)`, `at(c, ${t})`]);
          const direct = value([p, `${op}(${name}, j*${t})`]);
          // at() returns the curve's frame type: z/y for number curves, Γ for Γ.
          expect(at.type).toBe(direct.type === 'physicalImpedance' ? 'impedance' : direct.type);
          expectComplexClose(at.value, direct.value, 1e-12);
        }
      }
    }
  });

  it('Ω points and Ω elements: parameter in Ω, Z₀-dependent', () => {
    for (const z0 of [50, 75]) {
      const c = curveOf(['ZP = 30 + j40', 'seriesPath(ZP, Z(-j50), Z(j50))'], z0);
      expect(c.parameter).toMatchObject({ name: 'X', unit: 'Ω', min: -50, max: 50 });
      const at = value(['ZP = 30 + j40', 'c = seriesPath(ZP, Z(-j50), Z(j50))', 'at(c, 20)'], z0);
      const direct = value(['ZP = 30 + j40', 'z(series(ZP, Z(j20)))'], z0);
      expectComplexClose(at.value, direct.value);
    }
    expect(lastR(['ZP = 30 + j40', 'seriesPath(ZP, Z(j50))']).usesZ0).toBe(true);
    expect(lastR(['zP = 0.6', 'seriesPath(zP, j1)']).usesZ0).toBe(false);
    expect(lastR(['zP = 0.6', 'shuntPath(zP, Z(j25), Z(j100))']).usesZ0).toBe(true);
  });

  it('parameter names follow the element’s own value', () => {
    expect(curveOf(['seriesPath(z(1), -j1, j1)']).parameter.name).toBe('x');
    expect(curveOf(['seriesPath(z(1), 0, 2)']).parameter.name).toBe('r');
    expect(curveOf(['shuntPath(z(1), -j1, j1)']).parameter.name).toBe('b');
    expect(curveOf(['shuntPath(z(1), 0.1, 2)']).parameter.name).toBe('g');
    expect(curveOf(['seriesPath(z(1), y(j0.5), y(j2))']).parameter.name).toBe('b');
    expect(curveOf(['shuntPath(z(1), z(j0.5), z(j2))']).parameter.name).toBe('x');
    const s = curveOf(['seriesPath(z(1), 0, 1 + j1)']);
    expect(s.parameter).toMatchObject({ name: 's', min: 0, max: 1 });
    expectComplexClose(value(['c = seriesPath(z(1 - j1), 0, 1 + j1)', 'at(c, 0.5)']).value, complex(1.5, -0.5));
  });

  it('cross-domain elements: the parameter is the element’s own value, the operation adds its reciprocal', () => {
    for (const b of [0.5, 1, 1.7]) {
      const at = value(['zP = 0.4 + j0.7', 'c = seriesPath(zP, y(j0.5), y(j2))', `at(c, ${b})`]);
      expectComplexClose(at.value, add(complex(0.4, 0.7), div(complex(1, 0), complex(0, b))));
      const sh = value(['zP = 0.4 + j0.7', 'c = shuntPath(zP, Z(j25), Z(j100))', `at(c, ${b * 50})`]);
      expectComplexClose(sh.value, value(['zP = 0.4 + j0.7', `shunt(zP, Z(j*${b * 50}))`]).value);
    }
    const c = curveOf(['seriesPath(z(0.4 + j0.7), y(j0.5), y(j2))']);
    expect(c.shape?.kind).toBe('arc');
    expectOnShape(c, [0.5, 0.8, 1.2, 2]);
  });
});

describe('seriesPath / shuntPath: exact geometry', () => {
  it('series reactance sweep lies on the constant-r circle; shunt susceptance on constant-g', () => {
    const s = curveOf(['seriesPath(z(1 - j1), j2)']);
    expect(s.shape?.kind).toBe('arc');
    if (s.shape?.kind !== 'arc') return;
    expectComplexClose(s.shape.center, complex(0.5, 0));
    expect(s.shape.radius).toBeCloseTo(0.5, 14);
    expectComplexClose(s.shape.start, reflectionFromImpedance(complex(1, -1)));
    expectComplexClose(s.shape.end, reflectionFromImpedance(complex(1, 1)));
    expectOnShape(s, [0, 0.5, 1, 1.5, 2]);
    // Increasing x moves clockwise.
    expect(s.shape.sweep).toBeLessThan(0);

    const g = curveOf(['shuntPath(z(2), -j1, j1)']); // y = 0.5: g-circle in the impedance frame
    if (g.shape?.kind !== 'arc') throw new Error('expected arc');
    expectComplexClose(g.shape.center, complex(-1 / 3, 0));
    expect(g.shape.radius).toBeCloseTo(2 / 3, 14);
    expectOnShape(g, [-1, -0.3, 0, 0.6, 1]);
  });

  it('a sweep along the real axis is an exact segment', () => {
    const c = curveOf(['seriesPath(z(0.5), 0, 2)']);
    expect(c.shape?.kind).toBe('segment');
    expectOnShape(c, [0, 0.7, 2]);
  });

  it('reversal: shape runs from e0 to e1; the parameter range is sorted', () => {
    const c = curveOf(['seriesPath(z(1 - j1), j2, -j2)']);
    expect(c.parameter).toMatchObject({ min: -2, max: 2 });
    expectComplexClose(c.shape!.kind === 'arc' ? c.shape!.start : complex(0, 0), reflectionFromImpedance(complex(1, 1)));
    expect(c.shape!.kind === 'arc' && c.shape!.sweep > 0).toBe(true);
  });

  it('a tiny sweep is a tiny arc, not a full circle', () => {
    const c = curveOf(['seriesPath(z(1 - j1), 0, j1e-12)']);
    expect(c.shape?.kind).toBe('arc');
    if (c.shape?.kind === 'arc') expect(Math.abs(c.shape.sweep)).toBeLessThan(1e-9);
  });

  it('both chart modes: displayed as the exact flip of the canonical locus', () => {
    const c = curveOf(['shuntPath(z(2), -j1, j1)']);
    const imp = displayCurve(c, 'impedance');
    const adm = displayCurve(c, 'admittance');
    if (imp.shape?.kind !== 'arc' || adm.shape?.kind !== 'arc') throw new Error('arcs');
    expectComplexClose(adm.shape.center, complex(-imp.shape.center.re, -imp.shape.center.im), 1e-14);
    expect(adm.passive).toEqual(c.passive);
    // A sweep built on y is stored at C_Z(y) (the number frame) and, like every
    // number object, flipped in admittance mode: there it lies on the g = 0.5 grid circle.
    const y = curveOf(['shuntPath(y(0.5), -j1, j1)']);
    expect(y.domain).toBe('admittance');
    const yi = displayCurve(y, 'impedance').shape as Extract<Shape, { kind: 'arc' }>;
    const ya = displayCurve(y, 'admittance').shape as Extract<Shape, { kind: 'arc' }>;
    expectComplexClose(yi.center, complex(1 / 3, 0));
    expectComplexClose(ya.center, complex(-1 / 3, 0));
  });
});

describe('seriesPath / shuntPath: passive clipping', () => {
  it('clips exactly where Re crosses 0, and at() rejects values outside rather than clamping', () => {
    const c = curveOf(['seriesPath(z(0.5 + j0.2), -1, 1)']);
    expect(c.passive).toEqual([[-0.5, 1]]);
    expect(c.shape?.kind).toBe('arc');
    expect(abs((c.shape as Extract<Shape, { kind: "arc" }>).start)).toBeCloseTo(1, 14);
    expect(err(['c = seriesPath(z(0.5 + j0.2), -1, 1)', 'at(c, -0.8)'])).toMatch(/outside the drawn sweep.*-0\.5 … 1/);
    expect(abs(value(['c = seriesPath(z(0.5 + j0.2), -1, 1)', 'at(c, -0.5)']).value)).toBeGreaterThan(0);
    expect(err(['c = seriesPath(z(0.5), -j1, j1)', 'at(c, 3)'])).toMatch(/outside the drawn sweep/);
  });

  it('a fully active sweep is an error', () => {
    expect(err(['seriesPath(z(0.5), -3, -1)'])).toMatch(/never reaches the passive chart/);
  });

  it('cross-domain clipping with two passive pieces keeps both pieces exact', () => {
    // y = 0.1 with a shunt z element r: Re(0.1 + 1/r) ≥ 0  ⇔  r ≥ 0 or r ≤ −10.
    const c = curveOf(['shuntPath(y(0.1), z(-20), z(5))']);
    expect(c.passive!.length).toBe(2);
    expect(c.passive![0]![0]).toBe(-20);
    expect(c.passive![0]![1]).toBeCloseTo(-10, 12);
    expect(c.passive![1]![0]).toBeCloseTo(0, 12);
    expect(c.shape).toBeNull();
    // Two exact pieces (here segments of the real axis), ordered from e0 to e1.
    expect(c.pieces!.map((p) => p.kind)).toEqual(['segment', 'segment']);
    const [p1, p2] = c.pieces! as Extract<Shape, { kind: 'segment' }>[];
    expectComplexClose(p1!.start, c.point(-20)!);
    expectComplexClose(p1!.end, complex(-1, 0), 1e-12); // y = 0 at r = -10
    expectComplexClose(p2!.start, complex(1, 0)); // r = 0: y → ∞ (a short), so κ = C_Z(y) = +1
    expectComplexClose(p2!.end, c.point(5)!);
    // Intersections use both exact pieces, including the fast-moving end near r = 0.
    const hits = [1, 2].map((k) => value(['c = shuntPath(y(0.1), z(-20), z(5))', `intersect(c, vswrCircle(25), ${k})`]));
    expect(hits.map((h) => h.type)).toEqual(['admittance', 'admittance']);
    expectComplexClose(hits[0]!.value, complex(0.04, 0), 1e-12);
    expectComplexClose(hits[1]!.value, complex(25, 0), 1e-9);
    // Drawn as exact SVG pieces (chart units), not sampled.
    expect(curvePath(c, 1)).toBe(`${shapeToPath(p1!)} ${shapeToPath(p2!)}`);
    // Displayed in admittance mode: pieces flip with the curve.
    const flipped = displayCurve(c, 'admittance').pieces! as Extract<Shape, { kind: 'segment' }>[];
    expectComplexClose(flipped[1]!.start, complex(-1, 0));
    expect(err(['c = shuntPath(y(0.1), z(-20), z(5))', 'at(c, -5)'])).toMatch(/outside the drawn sweep/);
    expectComplexClose(
      value(['c = shuntPath(y(0.1), z(-20), z(5))', 'at(c, -15)']).value,
      value(['shunt(y(0.1), z(-15))']).value,
    );
  });

  it('a cross-domain element passing through 0 (open/short) stays finite', () => {
    const c = curveOf(['seriesPath(z(0.5 + j0.5), y(-j1), y(j1))']);
    const p = c.point(0)!;
    expectComplexClose(p, complex(1, 0)); // series open circuit → Γ = +1
  });
});

describe('seriesPath / shuntPath: two-argument form and errors', () => {
  it('two arguments start from 0 in the operation’s own domain', () => {
    const c = curveOf(['seriesPath(z(1 - j1), j2)']);
    expect(c.parameter).toMatchObject({ name: 'x', min: 0, max: 2 });
    expect(curveOf(['shuntPath(z(2), y(j1))']).parameter).toMatchObject({ name: 'b', min: 0, max: 1 });
    expect(curveOf(['ZP = 30 + j40', 'seriesPath(ZP, Z(j50))']).parameter).toMatchObject({ name: 'X', min: 0, max: 50 });
  });

  it('two arguments with a cross-domain element are rejected (zero would be singular)', () => {
    expect(err(['seriesPath(z(1), y(j1))'])).toMatch(/starts from z = 0.*e0/);
    expect(err(['shuntPath(z(1), z(j1))'])).toMatch(/starts from y = 0/);
    expect(err(['shuntPath(z(1), Z(j50))'])).toMatch(/starts from y = 0/);
  });

  it('rejects zero-width sweeps, mixed element types, and invalid elements', () => {
    expect(err(['seriesPath(z(1), j1, j1)'])).toMatch(/zero width/);
    expect(err(['seriesPath(z(1), 0)'])).toMatch(/zero width/);
    expect(err(['seriesPath(z(1), z(j1), y(j2))'])).toMatch(/same type/);
    expect(err(['seriesPath(z(1), gamma(0.1), gamma(0.2))'])).toMatch(/element must be/);
    expect(err(['ZP = 30', 'seriesPath(ZP, -j1, j1)'])).toMatch(/ambiguous/);
    expect(err(['seriesPath(2, j1)'])).toMatch(/RF meaning/);
  });

  it('series cannot move an open circuit, shunt cannot move a short', () => {
    expect(err(['seriesPath(gamma(1), j1)'])).toMatch(/open circuit/);
    expect(err(['shuntPath(z(0), j1)'])).toMatch(/short circuit/);
  });
});

describe('seriesPath / shuntPath: intersections, sliders', () => {
  it('L-network: shunt then series sweeps intersect at the match', () => {
    const lines = [
      'zM = 2',
      'p1 = shuntPath(zM, -j1, j1)',
      'zA = intersect(p1, rCircle(1), 1)',
      'zB = intersect(p1, rCircle(1), 2)',
    ];
    const r = run(lines).map((x) => ok(x));
    const hits = [r[2]!.value!.value, r[3]!.value!.value];
    const pos = hits.find((h) => h.im > 0)!;
    const neg = hits.find((h) => h.im < 0)!;
    expectComplexClose(pos, complex(1, 1), 1e-12);
    expectComplexClose(neg, complex(1, -1), 1e-12);
    const match = value([...lines, 'p2 = seriesPath(zB, 0, j2)', 'intersect(p2, xCircle(0))']);
    expect(match.type).toBe('impedance');
    expectComplexClose(match.value, complex(1, 0), 1e-12);
  });

  it('sliders re-evaluate the sweep', () => {
    const defs = ['zS = 2', 'bS = 0.5', 'c = shuntPath(zS, 0, j*bS)'].map(def);
    const first = [...evaluateExpressions(defs, 50).results.values()].at(-1)!.curve!;
    const moved = defs.map((d, i) => (i === 1 ? { ...d, text: withSliderValue(d.text, 1, 0.01)! } : d));
    const second = [...evaluateExpressions(moved, 50).results.values()].at(-1)!.curve!;
    expect(first.parameter.max).toBe(0.5);
    expect(second.parameter.max).toBe(1);
    expect(abs(sub(first.shape!.kind === 'arc' ? first.shape!.end : complex(0, 0), second.shape!.kind === 'arc' ? second.shape!.end : complex(0, 0)))).toBeGreaterThan(0.01);
  });
});
