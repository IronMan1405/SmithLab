import { describe, expect, it } from 'vitest';
import {
  type Complex,
  abs,
  complex,
  reflectionFromAdmittance,
  reflectionFromImpedance,
  sub,
} from '../src/core';
import {
  CHART_RADIUS,
  type CircleGeometry,
  type Shape,
  buildAdmittanceGrid,
  buildChartFrame,
  buildImpedanceGrid,
  conductanceCircle,
  conductanceCurve,
  gammaToSvg,
  reactanceBoundaryLabels,
  reactanceCircle,
  reactanceCurve,
  resistanceAxisLabels,
  resistanceCircle,
  resistanceCurve,
  susceptanceCircle,
  susceptanceCurve,
  svgToGamma,
  vswrCircle,
} from '../src/geometry';
import { shapeToPath } from '../src/chart/svg-path';
import { expectComplexClose } from './helpers';

function onCircle(circle: CircleGeometry, point: Complex): number {
  return Math.abs(abs(sub(point, circle.center)) - circle.radius);
}

describe('constant-resistance circles', () => {
  it.each([
    [0, 0, 1],
    [1, 0.5, 0.5],
    [2, 2 / 3, 1 / 3],
    [0.5, 1 / 3, 2 / 3],
  ])('r = %f has centre (%f, 0) and radius %f', (r, cu, radius) => {
    const c = resistanceCircle(r);
    expectComplexClose(c.center, complex(cu, 0));
    expect(c.radius).toBeCloseTo(radius, 15);
  });

  it('every circle passes through Γ = 1 and is tangent to the unit circle there', () => {
    for (const r of [0.1, 0.5, 1, 3, 10]) {
      const c = resistanceCircle(r);
      expect(c.center.re + c.radius).toBeCloseTo(1, 15);
    }
  });

  it('agrees with the core Γ(z) map at sampled points', () => {
    for (const r of [0, 0.2, 1, 4.5]) {
      for (const x of [-20, -1, -0.1, 0, 0.3, 2, 50]) {
        expect(onCircle(resistanceCircle(r), reflectionFromImpedance(complex(r, x)))).toBeLessThan(1e-12);
      }
    }
  });

  it('degenerates to the point Γ = 1 at r = ∞ and rejects r < 0', () => {
    expect(resistanceCircle(Infinity)).toEqual({ center: complex(1, 0), radius: 0 });
    expect(() => resistanceCircle(-0.1)).toThrow(RangeError);
  });
});

describe('constant-reactance circles', () => {
  it.each([
    [1, 1, 1],
    [-1, -1, 1],
    [0.5, 2, 2],
    [2, 0.5, 0.5],
    [-0.2, -5, 5],
  ])('x = %f has centre (1, %f) and radius %f', (x, cv, radius) => {
    const c = reactanceCircle(x);
    expectComplexClose(c.center, complex(1, cv));
    expect(c.radius).toBeCloseTo(radius, 15);
  });

  it('agrees with the core Γ(z) map at sampled points', () => {
    for (const x of [-5, -0.5, 0.2, 1, 10]) {
      for (const r of [0, 0.1, 1, 7, 100]) {
        expect(onCircle(reactanceCircle(x), reflectionFromImpedance(complex(r, x)))).toBeLessThan(1e-12);
      }
    }
  });

  it('rejects x = 0 (real axis is a line)', () => {
    expect(() => reactanceCircle(0)).toThrow(RangeError);
  });
});

describe('impedance curves (arcs)', () => {
  it('full resistance curve is a circle; r = 0 is the unit circle', () => {
    const boundary = resistanceCurve(0);
    expect(boundary.kind).toBe('circle');
    if (boundary.kind === 'circle') {
      expectComplexClose(boundary.center, complex(0, 0));
      expect(boundary.radius).toBe(1);
    }
  });

  it('reactance arc x = 1 runs from Γ = j on the boundary to Γ = 1, counter-clockwise, quarter turn', () => {
    const arc = reactanceCurve(1);
    expect(arc.kind).toBe('arc');
    if (arc.kind !== 'arc') return;
    expectComplexClose(arc.start, complex(0, 1));
    expectComplexClose(arc.end, complex(1, 0));
    // Centre (1, 1): start is at angle π, end at −π/2, travelling through the
    // inside of the unit disc, i.e. counter-clockwise by +π/2.
    expect(arc.sweep).toBeCloseTo(Math.PI / 2, 12);
  });

  it('negative reactance arcs mirror positive ones in the real axis', () => {
    for (const x of [0.2, 1, 5]) {
      const pos = reactanceCurve(x);
      const negative = reactanceCurve(-x);
      if (pos.kind !== 'arc' || negative.kind !== 'arc') throw new Error('expected arcs');
      expectComplexClose(negative.start, complex(pos.start.re, -pos.start.im));
      expect(negative.sweep).toBeCloseTo(-pos.sweep, 12);
    }
  });

  it('bounded arcs end on the bounding curves', () => {
    const arc = resistanceCurve(0.3, -2, 2);
    if (arc.kind !== 'arc') throw new Error('expected arc');
    expectComplexClose(arc.start, reflectionFromImpedance(complex(0.3, -2)));
    expectComplexClose(arc.end, reflectionFromImpedance(complex(0.3, 2)));
    expect(onCircle(reactanceCircle(2), arc.end)).toBeLessThan(1e-12);
    // The arc passes through the real axis on the left of its circle,
    // sweeping clockwise from bottom to top through Γ(0.3).
    expect(arc.sweep).toBeLessThan(0);
  });

  it('x = 0 curve is the real-axis segment from Γ = −1 to Γ = 1', () => {
    const axis = reactanceCurve(0);
    expect(axis.kind).toBe('segment');
    if (axis.kind !== 'segment') return;
    expectComplexClose(axis.start, complex(-1, 0));
    expectComplexClose(axis.end, complex(1, 0));
  });

  it('rejects invalid ranges', () => {
    expect(() => resistanceCurve(1, 2, 1)).toThrow(RangeError);
    expect(() => reactanceCurve(1, -1, 2)).toThrow(RangeError);
  });
});

describe('admittance circles', () => {
  it('conductance circles are resistance circles reflected through Γ = 0', () => {
    for (const g of [0.2, 1, 3]) {
      const yc = conductanceCircle(g);
      const zc = resistanceCircle(g);
      expectComplexClose(yc.center, complex(-zc.center.re, 0));
      expect(yc.radius).toBeCloseTo(zc.radius, 15);
    }
    expectComplexClose(conductanceCircle(1).center, complex(-0.5, 0));
  });

  it('susceptance circles have centre (−1, −1/b) and radius 1/|b|', () => {
    expectComplexClose(susceptanceCircle(1).center, complex(-1, -1));
    expectComplexClose(susceptanceCircle(-0.5).center, complex(-1, 2));
    expect(susceptanceCircle(-0.5).radius).toBe(2);
  });

  it('agree with the core Γ(y) map', () => {
    for (const g of [0, 0.5, 2]) {
      for (const b of [-3, -0.4, 0.4, 3]) {
        const gamma = reflectionFromAdmittance(complex(g, b));
        expect(onCircle(conductanceCircle(g), gamma)).toBeLessThan(1e-12);
        expect(onCircle(susceptanceCircle(b), gamma)).toBeLessThan(1e-12);
      }
    }
  });

  it('positive (capacitive) susceptance lies in the lower half', () => {
    const arc = susceptanceCurve(1);
    if (arc.kind !== 'arc') throw new Error('expected arc');
    expectComplexClose(arc.start, complex(0, -1));
    expectComplexClose(arc.end, complex(-1, 0));
    expect(conductanceCurve(1).kind).toBe('circle');
  });
});

describe('VSWR circles', () => {
  it('are centred at Γ = 0 with radius |Γ|', () => {
    expect(vswrCircle(2).radius).toBeCloseTo(1 / 3, 15);
    expect(vswrCircle(1).radius).toBe(0);
    expect(vswrCircle(Infinity).radius).toBe(1);
  });
});

/** Sample points along a shape (Γ-plane) for containment checks. */
function samples(shape: Shape, count = 32): Complex[] {
  if (shape.kind === 'segment') {
    return Array.from({ length: count + 1 }, (_, i) => {
      const t = i / count;
      return complex(shape.start.re + t * (shape.end.re - shape.start.re), shape.start.im + t * (shape.end.im - shape.start.im));
    });
  }
  const start = shape.kind === 'arc' ? shape.startAngle : 0;
  const sweep = shape.kind === 'arc' ? shape.sweep : 2 * Math.PI;
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = start + (i / count) * sweep;
    return complex(shape.center.re + shape.radius * Math.cos(t), shape.center.im + shape.radius * Math.sin(t));
  });
}

describe('default grids', () => {
  const zGrid = buildImpedanceGrid();
  const yGrid = buildAdmittanceGrid();

  it('contains both positive and negative reactance curves', () => {
    const xs = zGrid.filter((c) => c.family === 'reactance').map((c) => c.value);
    expect(xs.some((x) => x > 0)).toBe(true);
    expect(xs.filter((x) => x > 0).length).toBe(xs.filter((x) => x < 0).length);
  });

  it('every grid curve lies inside the closed unit disc', () => {
    for (const curve of [...zGrid, ...yGrid]) {
      for (const p of samples(curve.shape)) {
        expect(abs(p)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('every impedance curve lies on its own analytic circle', () => {
    for (const curve of zGrid) {
      if (curve.shape.kind === 'segment') continue;
      const circle = curve.family === 'resistance' ? resistanceCircle(curve.value) : reactanceCircle(curve.value);
      expectComplexClose(curve.shape.center, circle.center);
      expect(curve.shape.radius).toBeCloseTo(circle.radius, 12);
    }
  });

  it('has unique ids', () => {
    const ids = [...zGrid, ...yGrid].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('frame is the unit circle and real axis', () => {
    const frame = buildChartFrame();
    expect(frame.boundary.kind).toBe('circle');
    expect(frame.realAxis.kind).toBe('segment');
  });
});

describe('labels', () => {
  it('places resistance labels on the real axis at Γ(r)', () => {
    const label = resistanceAxisLabels([2]).find((l) => l.text === '2');
    expect(label).toBeDefined();
    expectComplexClose(label!.anchor, complex(1 / 3, 0));
  });

  it('places reactance labels on the unit circle, positive x in the upper half', () => {
    for (const label of reactanceBoundaryLabels()) {
      expect(abs(label.anchor)).toBeCloseTo(1, 12);
      expect(Math.sign(label.anchor.im)).toBe(label.text.startsWith('j') ? 1 : -1);
    }
    const j1 = reactanceBoundaryLabels([1]).find((l) => l.text === 'j1');
    expectComplexClose(j1!.anchor, complex(0, 1));
  });
});

describe('coordinate transforms', () => {
  it('maps Γ to SVG with +v upward', () => {
    expect(gammaToSvg(complex(0, 0))).toEqual({ x: 0, y: 0 });
    expect(gammaToSvg(complex(1, 0))).toEqual({ x: CHART_RADIUS, y: 0 });
    expect(gammaToSvg(complex(0, 1))).toEqual({ x: 0, y: -CHART_RADIUS });
    expect(gammaToSvg(complex(0, -1)).y).toBe(CHART_RADIUS);
  });

  it('round-trips SVG ↔ Γ', () => {
    const gamma = complex(0.123, -0.456);
    expectComplexClose(svgToGamma(gammaToSvg(gamma)), gamma);
  });

  it('refuses to map non-finite Γ', () => {
    expect(() => gammaToSvg(complex(Infinity, 0))).toThrow(RangeError);
  });
});

describe('SVG path generation', () => {
  it('draws the x = 1 arc with SVG flags for a counter-clockwise (screen clockwise-flipped) minor arc', () => {
    // Γ = j → (0, −1000); Γ = 1 → (1000, 0); radius 1000; small arc; CCW in Γ ⇒ sweep-flag 0.
    expect(shapeToPath(reactanceCurve(1))).toBe('M 0 -1000 A 1000 1000 0 0 0 1000 0');
  });

  it('draws x = −1 with the mirrored sweep flag', () => {
    expect(shapeToPath(reactanceCurve(-1))).toBe('M 0 1000 A 1000 1000 0 0 1 1000 0');
  });

  it('draws full circles as two half arcs', () => {
    expect(shapeToPath(resistanceCurve(1))).toBe('M 1000 0 A 500 500 0 0 0 0 0 A 500 500 0 0 0 1000 0 Z');
  });

  it('draws the real axis as a straight segment', () => {
    expect(shapeToPath(reactanceCurve(0))).toBe('M -1000 0 L 1000 0');
  });
});
