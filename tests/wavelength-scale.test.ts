import { describe, expect, it } from 'vitest';
import { abs, arg, complex, reflectionThroughLine } from '../src/core';
import {
  CHART_RADIUS,
  CHART_VIEWBOX,
  buildWavelengthScale,
  gammaToSvg,
  linePathCircle,
  lineTransformationArc,
  wavelengthsTowardGenerator,
  wavelengthsTowardLoad,
  wtgAngle,
} from '../src/geometry';
import { shapeToPath } from '../src/chart/svg-path';
import { expectComplexClose } from './helpers';

const LOAD = complex(0.3, 0.4);

describe('line path geometry', () => {
  it('constant-VSWR path is centred at Γ = 0 with radius |Γ_L|', () => {
    const c = linePathCircle(LOAD)!;
    expectComplexClose(c.center, complex(0, 0));
    expect(c.radius).toBeCloseTo(0.5, 15);
    expect(linePathCircle(complex(0, 0))).toBeNull();
  });

  it('arc runs from load to input, clockwise for positive length', () => {
    const arc = lineTransformationArc(LOAD, 0.1)!;
    expectComplexClose(arc.start, LOAD);
    expectComplexClose(arc.end, reflectionThroughLine(LOAD, 0.1));
    expect(arc.shape.kind).toBe('arc');
    if (arc.shape.kind === 'arc') expect(arc.shape.sweep).toBeCloseTo(-0.4 * Math.PI, 14);
    // Tangent at the end points clockwise: perpendicular to the radius, rotated −90°.
    const radial = arc.end;
    expect(arc.tangent.re * radial.re + arc.tangent.im * radial.im).toBeCloseTo(0, 14);
    expect(radial.re * arc.tangent.im - radial.im * arc.tangent.re).toBeLessThan(0);
  });

  it('negative length runs counter-clockwise; ≥ ½λ becomes a full circle', () => {
    const back = lineTransformationArc(LOAD, -0.1)!;
    if (back.shape.kind === 'arc') expect(back.shape.sweep).toBeGreaterThan(0);
    const full = lineTransformationArc(LOAD, 0.6)!;
    expect(full.shape.kind).toBe('circle');
    expect(full.turns).toBe(1);
    expect(lineTransformationArc(LOAD, 0)).toBeNull();
  });

  it('maps to SVG with the correct sweep flag (clockwise on screen ⇒ sweep-flag 1)', () => {
    const arc = lineTransformationArc(complex(-0.5, 0), 0.125)!;
    // From Γ = −0.5 (left) clockwise a quarter turn to Γ = +j0.5 (top).
    expect(shapeToPath(arc.shape)).toBe('M -500 0 A 500 500 0 0 1 0 -500');
  });
});

describe('wavelength scale orientation', () => {
  it('reads 0 at the short-circuit point and increases clockwise toward the generator', () => {
    expect(wavelengthsTowardGenerator(complex(-1, 0))).toBe(0);
    expect(wavelengthsTowardGenerator(complex(0, 1))).toBeCloseTo(0.125, 15); // top
    expect(wavelengthsTowardGenerator(complex(1, 0))).toBeCloseTo(0.25, 15); // right (open)
    expect(wavelengthsTowardGenerator(complex(0, -1))).toBeCloseTo(0.375, 15); // bottom
    expect(wavelengthsTowardGenerator(complex(0, 0))).toBeNull();
  });

  it('toward-load scale runs the other way', () => {
    expect(wavelengthsTowardLoad(complex(-1, 0))).toBe(0);
    expect(wavelengthsTowardLoad(complex(0, -1))).toBeCloseTo(0.125, 15);
    expect(wavelengthsTowardLoad(complex(0, 1))).toBeCloseTo(0.375, 15);
  });

  it('agrees with the line transformation: moving d toward the generator adds d to the WTG reading', () => {
    for (const d of [0.03, 0.11, 0.2, 0.37]) {
      const before = wavelengthsTowardGenerator(LOAD)!;
      const after = wavelengthsTowardGenerator(reflectionThroughLine(LOAD, d))!;
      expect((after - before + 0.5) % 0.5).toBeCloseTo(d, 12);
      const loadBefore = wavelengthsTowardLoad(LOAD)!;
      const loadAfter = wavelengthsTowardLoad(reflectionThroughLine(LOAD, d))!;
      expect((loadBefore - loadAfter + 0.5) % 0.5).toBeCloseTo(d, 12);
    }
  });

  it('wtgAngle inverts the reading', () => {
    for (const w of [0, 0.1, 0.25, 0.4]) {
      expect(wavelengthsTowardGenerator(complex(Math.cos(wtgAngle(w)), Math.sin(wtgAngle(w))))).toBeCloseTo(w, 12);
    }
  });
});

describe('wavelength scale construction', () => {
  const scale = buildWavelengthScale();

  it('has 50 ticks of 0.01λ, every fifth major and labelled', () => {
    expect(scale.ticks).toHaveLength(50);
    expect(scale.ticks.filter((t) => t.major)).toHaveLength(10);
    expect(scale.generatorLabels.map((l) => l.text)).toEqual(['0', '.05', '.10', '.15', '.20', '.25', '.30', '.35', '.40', '.45']);
    expect(scale.loadLabels.map((l) => l.text)).toEqual(['0', '.45', '.40', '.35', '.30', '.25', '.20', '.15', '.10', '.05']);
  });

  it('places ticks at the angle of their reading, outside the unit circle', () => {
    for (const tick of scale.ticks) {
      expect(wavelengthsTowardGenerator(tick.inner)).toBeCloseTo(tick.value, 12);
      expect(abs(tick.inner)).toBeGreaterThan(1);
      expect(abs(tick.outer)).toBeGreaterThan(abs(tick.inner));
    }
    // The 0.125λ tick is at the top of the chart.
    const top = scale.ticks.find((t) => Math.abs(t.value - 0.13) < 1e-9)!;
    expect(arg(top.inner)).toBeLessThan(Math.PI / 2); // just clockwise of the top
  });

  it('fits within the chart viewBox in SVG coordinates', () => {
    const outermost = Math.max(scale.generatorTitlePath.radius, scale.loadTitlePath.radius) + 0.025;
    expect(outermost * CHART_RADIUS).toBeLessThan(CHART_VIEWBOX.width / 2);
    const p = gammaToSvg(scale.ticks[0]!.outer);
    expect(p.x).toBeLessThan(-CHART_RADIUS); // 0λ tick is on the left
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('title paths run left to right: generator clockwise along the top, load counter-clockwise along the bottom', () => {
    const g = scale.generatorTitlePath;
    const l = scale.loadTitlePath;
    expect(g.sweep).toBeLessThan(0);
    expect(g.start.re).toBeLessThan(g.end.re);
    expect(g.start.im).toBeGreaterThan(0);
    expect(l.sweep).toBeGreaterThan(0);
    expect(l.start.re).toBeLessThan(l.end.re);
    expect(l.start.im).toBeLessThan(0);
  });
});
