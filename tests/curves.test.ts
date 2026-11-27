import { describe, expect, it } from 'vitest';
import { abs, complex, reflectionFromAdmittance, reflectionFromImpedance, reflectionThroughLine, sub, vswrFromReflection } from '../src/core';
import {
  type Curve,
  conductanceCircleCurve,
  displayCurve,
  intersectCurves,
  linePathCurve,
  parametricCurve,
  reactanceCircleCurve,
  resistanceCircleCurve,
  sampleCurve,
  susceptanceCircleCurve,
  vswrCircleCurve,
} from '../src/geometry';
import { expectComplexClose } from './helpers';

const onCircle = (p: { re: number; im: number }, c: { re: number; im: number }, r: number) =>
  Math.abs(abs(sub(p, c)) - r);

describe('curve constructions', () => {
  it('constant-VSWR circle: centre 0, radius (s−1)/(s+1), parameterised by WTG', () => {
    const c = vswrCircleCurve(1 / 3, 2);
    expect(c.shape).toMatchObject({ kind: 'circle', radius: 1 / 3 });
    expectComplexClose(c.shape!.kind === 'circle' ? c.shape!.center : complex(9, 9), complex(0, 0));
    expectComplexClose(c.point(0)!, complex(-1 / 3, 0), 1e-12); // WTG 0 at the short-circuit side
    expectComplexClose(c.point(0.125)!, complex(0, 1 / 3), 1e-12); // clockwise to the top
    for (const t of [0.05, 0.2, 0.41]) expect(vswrFromReflection(c.point(t)!)).toBeCloseTo(2, 12);
    expect(() => vswrCircleCurve(1.2, 0)).toThrow(RangeError);
  });

  it('constant-r circle follows Γ = (z−1)/(z+1) with z = r + jx', () => {
    const c = resistanceCircleCurve(0.5);
    expect(c.shape).toMatchObject({ kind: 'circle' });
    for (const x of [-7, -1, 0, 0.3, 4]) {
      const p = c.point(x)!;
      expectComplexClose(p, reflectionFromImpedance(complex(0.5, x)));
      expect(onCircle(p, complex(1 / 3, 0), 2 / 3)).toBeLessThan(1e-12);
    }
    expect(() => resistanceCircleCurve(-1)).toThrow(RangeError);
  });

  it('constant-x arcs: positive x in the upper half, negative in the lower', () => {
    const up = reactanceCircleCurve(1);
    const down = reactanceCircleCurve(-1);
    expect(up.point(0.5)!.im).toBeGreaterThan(0);
    expect(down.point(0.5)!.im).toBeLessThan(0);
    expect(up.shape).toMatchObject({ kind: 'arc' });
    expect(reactanceCircleCurve(0).shape).toMatchObject({ kind: 'segment' });
    expectComplexClose(up.point(0)!, complex(0, 1)); // r = 0 on the unit circle
  });

  it('conductance and susceptance curves are admittance *numbers*, stored canonically at C_Z(g + jb)', () => {
    const g = conductanceCircleCurve(1);
    expect(g).toMatchObject({ frame: 'number', domain: 'admittance' });
    expectComplexClose(g.point(0.4)!, reflectionFromImpedance(complex(1, 0.4)));
    // In admittance mode they are drawn at Γ = (1 − y)/(1 + y), on the drawn admittance grid.
    expectComplexClose(displayCurve(g, 'admittance').point(0.4)!, reflectionFromAdmittance(complex(1, 0.4)), 1e-15);
    // Capacitive b > 0: lower half on the admittance grid, upper half when read on the impedance grid.
    expect(displayCurve(susceptanceCircleCurve(1), 'admittance').point(0.5)!.im).toBeLessThan(0);
    expect(displayCurve(susceptanceCircleCurve(1), 'impedance').point(0.5)!.im).toBeGreaterThan(0);
  });

  it('transmission-line path: on the |Γ_L| circle, clockwise for increasing l', () => {
    const gL = complex(0.3, 0.4);
    const c = linePathCurve(gL, 0, 0.125);
    expect(c.shape?.kind).toBe('arc');
    if (c.shape?.kind === 'arc') {
      expectComplexClose(c.shape.start, gL);
      expectComplexClose(c.shape.end, complex(0.4, -0.3));
      expect(c.shape.sweep).toBeCloseTo(-Math.PI / 2, 12);
    }
    for (const l of [0.01, 0.06, 0.12]) {
      expectComplexClose(c.point(l)!, reflectionThroughLine(gL, l));
      expect(abs(c.point(l)!)).toBeCloseTo(0.5, 14);
    }
    expect(linePathCurve(gL, 0, 0.7).shape?.kind).toBe('circle');
    expect(() => linePathCurve(gL, 0.3, 0.1)).toThrow(RangeError);
  });
});

describe('adaptive sampling', () => {
  const circle = (r: number) => (t: number) => complex(r * Math.cos(2 * Math.PI * t), r * Math.sin(2 * Math.PI * t));

  it('meets the chord tolerance everywhere', () => {
    const tol = 1e-4;
    const { polylines } = sampleCurve(circle(0.5), 0, 1, { tolerance: tol });
    expect(polylines).toHaveLength(1);
    const line = polylines[0]!;
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const mid = circle(0.5)((a.t + b.t) / 2);
      const chordMid = complex((a.p.re + b.p.re) / 2, (a.p.im + b.p.im) / 2);
      expect(abs(sub(mid, chordMid))).toBeLessThan(tol * 1.01);
    }
  });

  it('refines adaptively: tighter tolerance → more samples, concentrated where curvature is high', () => {
    const coarse = sampleCurve(circle(0.5), 0, 1, { tolerance: 1e-3 }).polylines[0]!.length;
    const fine = sampleCurve(circle(0.5), 0, 1, { tolerance: 1e-6 }).polylines[0]!.length;
    expect(fine).toBeGreaterThan(coarse * 4);
    // A curve that is straight for t < 0.5 and tightly curved afterwards.
    const mixed = (t: number) => (t < 0.5 ? complex(t - 0.5, 0) : complex(0.05 * Math.sin(40 * (t - 0.5)), 0.05 * (1 - Math.cos(40 * (t - 0.5)))));
    const pts = sampleCurve(mixed, 0, 1, { tolerance: 1e-5, maxSegmentLength: 1 }).polylines.flat();
    const straight = pts.filter((p) => p.t < 0.5).length;
    const curved = pts.filter((p) => p.t >= 0.5).length;
    expect(curved).toBeGreaterThan(straight * 3);
  });

  it('clips at the unit circle exactly and splits into separate pieces', () => {
    // Circle of radius 0.6 centred at 0.8: partly outside the chart.
    const f = (t: number) => complex(0.8 + 0.6 * Math.cos(2 * Math.PI * t), 0.6 * Math.sin(2 * Math.PI * t));
    const { polylines } = sampleCurve(f, 0, 1, { tolerance: 1e-5 });
    for (const line of polylines) for (const s of line) expect(abs(s.p)).toBeLessThanOrEqual(1 + 1e-12);
    // Endpoints of the inside arc lie on the unit circle.
    const all = polylines.flat();
    const onBoundary = all.filter((s) => Math.abs(abs(s.p) - 1) < 1e-10);
    expect(onBoundary.length).toBeGreaterThanOrEqual(2);
  });

  it('breaks at singularities instead of connecting across them', () => {
    const f = (t: number) => (Math.abs(t - 0.5) < 0.01 ? null : complex(0.8 * t - 0.4, 0));
    const { polylines } = sampleCurve(f, 0, 1, { tolerance: 1e-6 });
    expect(polylines).toHaveLength(2);
    expect(polylines[0]!.at(-1)!.t).toBeLessThan(0.5);
    expect(polylines[1]![0]!.t).toBeGreaterThan(0.5);
  });

  it('breaks at jump discontinuities (no connecting segment)', () => {
    const f = (t: number) => (t < 0.37 ? complex(-0.3, 0.2 * t) : complex(0.3, 0.2 * t));
    const { polylines } = sampleCurve(f, 0, 1, { tolerance: 1e-5 });
    expect(polylines).toHaveLength(2);
    for (const line of polylines) {
      for (let i = 0; i + 1 < line.length; i++) expect(Math.abs(line[i + 1]!.p.re - line[i]!.p.re)).toBeLessThan(1e-9);
    }
  });

  it('treats thrown errors and NaN as undefined points', () => {
    const f = (t: number) => {
      if (t > 0.6) throw new Error('boom');
      return t > 0.3 && t < 0.4 ? complex(NaN, 0) : complex(t / 2, 0);
    };
    const { polylines } = sampleCurve(f, 0, 1, { tolerance: 1e-5 });
    expect(polylines).toHaveLength(2);
  });

  it('respects the evaluation budget', () => {
    const r = sampleCurve(circle(0.5), 0, 1, { tolerance: 1e-12, budget: 500 });
    expect(r.evaluations).toBeLessThan(1200);
    expect(r.truncated).toBe(true);
  });
});

describe('intersections (exact)', () => {
  it('a constant-r circle and a constant-x arc meet at Γ(r + jx) and at Γ = 1', () => {
    const r = intersectCurves(resistanceCircleCurve(0.5), reactanceCircleCurve(1.2));
    expect(r.points).toHaveLength(2);
    expectComplexClose(r.points[0]!.gamma, reflectionFromImpedance(complex(0.5, 1.2)), 1e-12);
    expectComplexClose(r.points[1]!.gamma, complex(1, 0), 1e-9); // the point at infinity
  });

  it('negative reactance intersects in the lower half', () => {
    const r = intersectCurves(resistanceCircleCurve(2), reactanceCircleCurve(-0.5));
    expectComplexClose(r.points[0]!.gamma, reflectionFromImpedance(complex(2, -0.5)), 1e-12);
  });

  it('VSWR circle and r = 1 circle: the two matching candidates', () => {
    const vswr = vswrCircleCurve(0.5, 3);
    const r = intersectCurves(vswr, resistanceCircleCurve(1));
    expect(r.points).toHaveLength(2);
    for (const p of r.points) {
      expect(abs(p.gamma)).toBeCloseTo(0.5, 12); // on the VSWR circle
      expect(onCircle(p.gamma, complex(0.5, 0), 0.5)).toBeLessThan(1e-12); // on r = 1
      expect(p.tangent).toBe(false);
    }
    // Symmetric about the real axis, upper one first for equal Re.
    expect(r.points[0]!.gamma.im).toBeGreaterThan(0);
    expectComplexClose(r.points[0]!.gamma, complex(r.points[1]!.gamma.re, -r.points[1]!.gamma.im), 1e-12);
  });

  it('detects tangency as a single point', () => {
    // r = 1 circle (centre 0.5, radius 0.5) and |Γ| = 1 circle touch at Γ = 1.
    const unit = vswrCircleCurve(1, Infinity);
    const r = intersectCurves(unit, resistanceCircleCurve(1));
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.tangent).toBe(true);
    expectComplexClose(r.points[0]!.gamma, complex(1, 0), 1e-9);
    // VSWR circle of radius 1/3 touches r = 2 circle (centre 2/3, radius 1/3) at Γ = 1/3.
    const t = intersectCurves(vswrCircleCurve(1 / 3, 2), resistanceCircleCurve(2));
    expect(t.points.filter((p) => p.tangent)).toHaveLength(1);
    expectComplexClose(t.points[0]!.gamma, complex(1 / 3, 0), 1e-9);
  });

  it('distinguishes near-misses from intersections', () => {
    const r = intersectCurves(vswrCircleCurve(0.3, 1.857), resistanceCircleCurve(3)); // r=3: centre .75, radius .25
    expect(r.points).toHaveLength(0);
    expect(r.closestApproach).toBeCloseTo(0.75 - 0.25 - 0.3, 12);
  });

  it('reports coincident curves without inventing points', () => {
    const r = intersectCurves(resistanceCircleCurve(1), resistanceCircleCurve(1));
    expect(r.coincident).toBe(true);
    expect(r.points).toHaveLength(0);
  });

  it('restricts to arc ranges', () => {
    // A short line path cannot reach the far side of the r = 1 circle.
    const path = linePathCurve(complex(-0.5, 0), 0, 0.05);
    expect(intersectCurves(path, resistanceCircleCurve(1)).points).toHaveLength(0);
    const full = linePathCurve(complex(-0.5, 0), 0, 0.5);
    expect(intersectCurves(full, resistanceCircleCurve(1)).points.length).toBeGreaterThan(0);
  });

  it('line segment (x = 0) intersections', () => {
    const r = intersectCurves(reactanceCircleCurve(0), vswrCircleCurve(0.5, 3));
    expect(r.points.map((p) => p.gamma.re)).toEqual([-0.5, 0.5]);
  });

  it('identical circles are coincident, not a set of duplicate points', () => {
    const r = intersectCurves(resistanceCircleCurve(0), vswrCircleCurve(1, Infinity));
    expect(r.coincident).toBe(true);
  });

  it('a near-tangency within tolerance gives one point, not two almost-equal ones', () => {
    const r = intersectCurves(vswrCircleCurve(1 / 3 + 1e-11, 2), resistanceCircleCurve(2));
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.tangent).toBe(true);
    // Just outside tolerance it is a genuine near-miss.
    const miss = intersectCurves(vswrCircleCurve(1 / 3 - 1e-6, 2), resistanceCircleCurve(2));
    expect(miss.points).toHaveLength(0);
    expect(miss.closestApproach).toBeCloseTo(1e-6, 12);
  });
});

describe('intersections (numerical)', () => {
  const asParametric = (c: Curve): Curve => ({ ...c, shape: null, kind: 'parametric' });

  it('parametric vs exact matches the analytic answer', () => {
    const exact = intersectCurves(resistanceCircleCurve(0.5), reactanceCircleCurve(1.2));
    const numeric = intersectCurves(asParametric(linePathCurve(reflectionFromImpedance(complex(0.5, 1.2)), -0.1, 0.1)), resistanceCircleCurve(0.5));
    expect(numeric.points.some((p) => abs(sub(p.gamma, exact.points[0]!.gamma)) < 1e-9)).toBe(true);
    expect(numeric.points.every((p) => p.numerical)).toBe(true);
  });

  it('parametric vs parametric uses Newton refinement', () => {
    const a = parametricCurve((t) => complex(t, 0.2), 't', -0.8, 0.8);
    const b = parametricCurve((s) => complex(0.1, s), 's', -0.8, 0.8);
    const r = intersectCurves(a, b);
    expect(r.points).toHaveLength(1);
    expectComplexClose(r.points[0]!.gamma, complex(0.1, 0.2), 1e-10);
  });
});
