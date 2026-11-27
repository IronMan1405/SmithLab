import { describe, expect, it } from 'vitest';
import {
  abs,
  admittanceFromReflection,
  arg,
  complex,
  impedanceFromReflection,
  reflectionFromAdmittance,
  reflectionFromImpedance,
  reflectionThroughLine,
  sub,
} from '../src/core';
import {
  type ExpressionDef,
  createExpressionDef,
  evaluateExpressions,
  plottedGamma,
  plottedPosition,
  rewriteForDrag,
} from '../src/expressions';
import {
  type ChartMode,
  CHART_RADIUS,
  CHART_VIEWBOX,
  activeGridReading,
  buildWavelengthScale,
  conductanceCurve,
  displayCurve,
  displayPosition,
  guideAnnotations,
  intersectCurves,
  intersectionFrame,
  radialGuideCurve,
  resistanceCircleCurve,
  rotateCurve,
  rotateShape,
  unitPhasor,
  uprightTangentAngle,
  vswrCircleCurve,
  wavelengthsTowardGenerator,
  wavelengthsTowardLoad,
} from '../src/geometry';
import { createWorkspace, resolveGamma, resolvePoints, workspaceReducer as reduce } from '../src/workspace';
import { expectComplexClose } from './helpers';

let n = 0;
const def = (text: string, extra: Partial<ExpressionDef> = {}): ExpressionDef => ({ ...createExpressionDef(`m${++n}`, text), ...extra });
const MODES: readonly ChartMode[] = ['impedance', 'admittance'];

function evalAll(lines: readonly string[], z0 = 50) {
  const defs = lines.map((t) => def(t));
  const out = evaluateExpressions(defs, z0);
  const byName = (name: string) => [...out.results.values()].find((r) => r.name === name)!;
  /** Displayed position of a named expression in a mode. */
  const shown = (name: string, mode: ChartMode) => {
    const p = plottedPosition(byName(name))!;
    return displayPosition(p.position, p.frame, mode);
  };
  return { defs, out, byName, shown };
}

const zL = complex(0.6, 0.8);
const gammaPhys = reflectionFromImpedance(zL); // = j0.5

describe('chart coordinate modes: points', () => {
  const { shown } = evalAll(['zL = 0.6 + j0.8', 'yL = 1/zL', 'gammaL = gamma(zL)', 'ZL = Z(zL)']);

  it('impedance mode: zL at its Γ, yL = 1/zL diametrically opposite (current code put them together)', () => {
    expectComplexClose(shown('zL', 'impedance'), gammaPhys, 1e-14);
    expectComplexClose(shown('yL', 'impedance'), complex(-gammaPhys.re, -gammaPhys.im), 1e-14);
  });

  it('admittance mode: yL on its admittance-grid coordinates (the load Γ), zL opposite', () => {
    expectComplexClose(shown('yL', 'admittance'), gammaPhys, 1e-14);
    expectComplexClose(shown('zL', 'admittance'), complex(-gammaPhys.re, -gammaPhys.im), 1e-14);
    // yL really reads its own number on the admittance grid there:
    expectComplexClose(activeGridReading(shown('yL', 'admittance'), 'admittance'), complex(0.6, -0.8), 1e-13);
  });

  it('each number reads its own value on the active grid', () => {
    for (const mode of MODES) {
      expectComplexClose(activeGridReading(shown('zL', mode), mode), zL, 1e-13);
      expectComplexClose(activeGridReading(shown('yL', mode), mode), complex(0.6, -0.8), 1e-13);
    }
  });

  it('physical Γ expressions are fixed in both modes', () => {
    for (const mode of MODES) expectComplexClose(shown('gammaL', mode), gammaPhys, 1e-14);
  });

  it('Z (ohms) values are numbers Z/Z₀ and move with Z₀', () => {
    expectComplexClose(shown('ZL', 'impedance'), gammaPhys, 1e-13);
    const at25 = evalAll(['ZA = 30 + j40'], 25).shown('ZA', 'impedance');
    expectComplexClose(at25, reflectionFromImpedance(complex(1.2, 1.6)), 1e-13);
  });

  it('readouts keep the physical load: plottedGamma of yL is the load Γ in every mode', () => {
    const { byName } = evalAll(['zL = 0.6 + j0.8', 'yL = 1/zL']);
    expectComplexClose(plottedGamma(byName('yL'))!, gammaPhys, 1e-14);
  });

  it('manual points and line inputs are plane positions: unchanged by the mode', () => {
    let s = reduce(createWorkspace(), { type: 'point/create', id: 'p', gamma: complex(0.3, 0.4) });
    s = reduce(s, { type: 'line/add', id: 'in', sourceId: 'p', length: 0.125 });
    for (const mode of MODES) {
      for (const p of resolvePoints(s)) expect(displayPosition(p.gamma, 'plane', mode)).toEqual(p.gamma);
    }
    expectComplexClose(resolveGamma(s, 'in')!, complex(0.4, -0.3));
  });
});

describe('mode switching and grid visibility never alter values or workspace data', () => {
  const lines = ['zL = 0.6 + j0.8', 'yL = 1/zL', 'z1 = line(zL, 0.125)', 'z2 = shunt(z1, j0.5)', 'c = rCircle(1)', 'p = intersect(vswrCircle(zL), c, 1)'];

  it('switching chart mode changes no workspace data', () => {
    let s = reduce(createWorkspace(), { type: 'point/create', id: 'pt', gamma: complex(0.2, 0.1) });
    for (const t of lines) s = reduce(s, { type: 'expression/add', id: `e-${t}`, text: t });
    s = reduce(s, { type: 'guide/add', id: 'g', sourceId: 'pt' });
    const before = s;
    const after = reduce(reduce(s, { type: 'chart/set-mode', mode: 'admittance' }), { type: 'chart/set-mode', mode: 'impedance' });
    const flipped = reduce(s, { type: 'chart/set-mode', mode: 'admittance' });
    expect(flipped.chartMode).toBe('admittance');
    for (const key of ['points', 'derived', 'expressions', 'guides', 'selectedId', 'z0'] as const) {
      expect(flipped[key]).toBe(before[key]); // same objects, untouched
      expect(after[key]).toBe(before[key]);
    }
    expect(() => reduce(s, { type: 'chart/set-mode', mode: 'smith' as never })).toThrow(RangeError);
  });

  it('expression values and dependencies do not depend on the mode (evaluation has no mode input)', () => {
    const defs = lines.map((t) => def(t));
    const a = evaluateExpressions(defs, 50);
    const b = evaluateExpressions(defs, 50, a);
    expect(b.recomputed.size).toBe(0); // nothing to recompute when only the view changes
    for (const r of a.results.values()) {
      expect(r.dependencies).toEqual(b.results.get(r.id)!.dependencies);
      expect(r.value).toEqual(b.results.get(r.id)!.value);
    }
  });

  it('grid labels and grids do not read the workspace (visibility is a view setting)', async () => {
    const geometry = await import('../src/geometry');
    expect(geometry.chartLabels.length).toBe(1); // only the visibility flags
    expect(geometry.buildImpedanceGrid.length).toBeLessThanOrEqual(1);
  });
});

describe('transmission lines and series/shunt in both modes', () => {
  it('line() of a y value rotates its displayed position clockwise in both modes', () => {
    const { shown } = evalAll(['zL = 0.6 + j0.8', 'yL = 1/zL', 'yIn = line(yL, 0.125)']);
    for (const mode of MODES) {
      expectComplexClose(shown('yIn', mode), reflectionThroughLine(shown('yL', mode), 0.125), 1e-13);
    }
    // In admittance mode the y path is the load's physical Γ path.
    expectComplexClose(shown('yIn', 'admittance'), reflectionThroughLine(gammaPhys, 0.125), 1e-13);
  });

  it('linePath of z and of y are drawn exactly half a turn apart, and swap with the mode', () => {
    const { out, byName } = evalAll(['zL = 0.6 + j0.8', 'yL = 1/zL', 'pz = linePath(zL, 0.2)', 'py = linePath(yL, 0.2)']);
    void out;
    const pz = byName('pz').curve!;
    const py = byName('py').curve!;
    for (const t of [0, 0.07, 0.2]) {
      expectComplexClose(displayCurve(py, 'impedance').point(t)!, complex(-pz.point(t)!.re, -pz.point(t)!.im), 1e-13);
      expectComplexClose(displayCurve(py, 'admittance').point(t)!, pz.point(t)!, 1e-13);
    }
  });

  it('series/shunt results are placed by their number on the active grid', () => {
    const { shown } = evalAll(['zM = 2', 'zM1 = shunt(zM, j0.5)', 'zM2 = series(zM1, j1)', 'yM = y(zM)', 'yM1 = shunt(yM, j0.5)']);
    expectComplexClose(shown('zM2', 'impedance'), complex(0, 0), 1e-14); // matched in both modes
    expectComplexClose(shown('zM2', 'admittance'), complex(0, 0), 1e-14);
    expectComplexClose(shown('zM1', 'impedance'), reflectionFromImpedance(complex(1, -1)), 1e-14);
    expectComplexClose(shown('zM1', 'admittance'), reflectionFromAdmittance(complex(1, -1)), 1e-14);
    // yM1 = 0.5 + j0.5 is the same load as zM1 (1 − j1): it reads its number on the active grid.
    expectComplexClose(activeGridReading(shown('yM1', 'admittance'), 'admittance'), complex(0.5, 0.5), 1e-13);
    expectComplexClose(shown('yM1', 'admittance'), shown('zM1', 'impedance'), 1e-13);
  });

  it('a 3A line input on a manual point is mode-independent', () => {
    let s = reduce(createWorkspace(), { type: 'point/create', id: 'p', gamma: gammaPhys });
    s = reduce(s, { type: 'line/add', id: 'in', sourceId: 'p', length: 0.25 });
    for (const mode of MODES) expectComplexClose(displayPosition(resolveGamma(s, 'in')!, 'plane', mode), complex(0, -0.5), 1e-14);
  });
});

describe('dragging expression points in both modes', () => {
  it('dragging a point to where it already is leaves its text unchanged', () => {
    for (const text of ['zA = 0.6 + j0.8', 'yA = 0.3 - j0.4', 'gammaA = 0.2 + j0.1', 'ZA = 30 + j40']) {
      const { defs, out, shown } = evalAll([text]);
      for (const mode of MODES) {
        const at = shown(text.split(' ')[0]!, mode);
        expect(rewriteForDrag(defs[0]!, out.results.get(defs[0]!.id), at, 50, mode)).toBe(text);
      }
    }
  });

  it('dragging to a displayed position writes the active-grid number there', () => {
    const { defs, out } = evalAll(['yA = 0.3 - j0.4']);
    const target = reflectionFromAdmittance(complex(0.5, 0)); // admittance grid g = 0.5 (Γ = 1/3)
    expect(rewriteForDrag(defs[0]!, out.results.get(defs[0]!.id), target, 50, 'admittance')).toBe('yA = 0.5');
    expect(rewriteForDrag(defs[0]!, out.results.get(defs[0]!.id), target, 50, 'impedance')).toBe('yA = 2');
  });
});

describe('selection overlay follows the active grid', () => {
  it('reads z in impedance mode and y in admittance mode at the same displayed point', () => {
    const p = complex(0.2, 0.3);
    expectComplexClose(activeGridReading(p, 'impedance'), impedanceFromReflection(p));
    expectComplexClose(activeGridReading(p, 'admittance'), admittanceFromReflection(p));
    // The admittance overlay circle through p is the drawn g circle.
    const g = admittanceFromReflection(p).re;
    const c = conductanceCurve(g);
    if (c.kind === 'circle') expect(Math.abs(abs(sub(p, c.center)) - c.radius)).toBeLessThan(1e-12);
  });
});

describe('number curves in both modes', () => {
  it('gCircle(1) coincides with rCircle(1) in impedance mode and with the drawn g = 1 circle in admittance mode', () => {
    const { byName } = evalAll(['cg = gCircle(1)', 'cr = rCircle(1)']);
    const cg = byName('cg').curve!;
    const cr = byName('cr').curve!;
    expect(displayCurve(cg, 'impedance').shape).toEqual(displayCurve(cr, 'impedance').shape);
    const shownY = displayCurve(cg, 'admittance').shape!;
    const drawn = conductanceCurve(1);
    if (shownY.kind === 'circle' && drawn.kind === 'circle') {
      expectComplexClose(shownY.center, drawn.center, 1e-15);
      expect(shownY.radius).toBeCloseTo(drawn.radius, 15);
    } else throw new Error('expected circles');
  });

  it('displayCurve is exact (no resampling), cached by identity, and a no-op for plane curves', () => {
    const c = resistanceCircleCurve(0.5);
    const shown = displayCurve(c, 'admittance');
    expect(shown.shape?.kind).toBe('circle');
    expect(displayCurve(c, 'admittance')).toBe(shown);
    const v = vswrCircleCurve(0.5, 3);
    expect(displayCurve(v, 'admittance')).toBe(v);
  });
});

describe('intersections and frames', () => {
  it('number ∩ number gives a typed number, identical in every mode', () => {
    const { byName } = evalAll(['cr = rCircle(0.5)', 'cx = xCircle(1.2)', 'p = intersect(cr, cx)']);
    expect(byName('p').value).toMatchObject({ type: 'impedance' });
    expectComplexClose(byName('p').value!.value, complex(0.5, 1.2), 1e-12);
  });

  it('admittance curves intersect as admittance numbers', () => {
    const { byName } = evalAll(['cg = gCircle(0.5)', 'cb = bCircle(1.2)', 'p = intersect(cg, cb)']);
    expect(byName('p').value!.type).toBe('admittance');
    expectComplexClose(byName('p').value!.value, complex(0.5, 1.2), 1e-12);
  });

  it('number ∩ symmetric plane curve (VSWR circle) is allowed and moves with the number curve', () => {
    const { byName, shown } = evalAll(['zL = 0.6 + j0.8', 'v = vswrCircle(zL)', 'r1 = rCircle(1)', 'p = intersect(v, r1, 1)']);
    expect(byName('p').value!.type).toBe('impedance');
    expect(byName('p').value!.value.re).toBeCloseTo(1, 12);
    for (const mode of MODES) expect(abs(shown('p', mode))).toBeCloseTo(0.5, 12);
  });

  it('plane ∩ plane gives a Γ point', () => {
    const { byName } = evalAll(['gL = 0.3 + j0.4', 'gammaL = gamma(gL)', 'g1 = radial(gammaL)', 'v = vswrCircle(2)', 'p = intersect(g1, v)']);
    expect(byName('p').value!.type).toBe('reflection');
    expect(abs(byName('p').value!.value)).toBeCloseTo(1 / 3, 14);
  });

  it('number ∩ asymmetric plane curve is reported as mode-dependent (a current limitation)', () => {
    const { byName } = evalAll(['gammaL = 0.3 + j0.4', 'g1 = radial(gammaL)', 'r1 = rCircle(1)', 'p = intersect(g1, r1)']);
    expect(byName('p').error!.message).toMatch(/depend on the chart coordinate mode/);
    const frame = intersectionFrame(byName('g1').curve!, byName('r1').curve!);
    expect(frame.ok).toBe(false);
  });

  it('at() on a number curve returns its number, on a plane curve a Γ', () => {
    const { byName } = evalAll(['p = at(rCircle(1), 2)', 'q = at(vswrCircle(3), 0.125)']);
    expectComplexClose(byName('p').value!.value, complex(1, 2), 1e-12);
    expect(byName('q').value!.type).toBe('reflection');
  });
});

describe('rotate(curve, θ)', () => {
  it('rotates exact circles about Γ = 0 and keeps the parameter', () => {
    const r1 = resistanceCircleCurve(1);
    const rot = rotateCurve(r1, Math.PI / 2);
    expect(rot.shape).toMatchObject({ kind: 'circle', radius: 0.5 });
    if (rot.shape?.kind === 'circle') expectComplexClose(rot.shape.center, complex(0, 0.5), 1e-15);
    expect(rot.parameter).toEqual(r1.parameter);
    for (const x of [-3, 0, 1.7]) {
      const p = r1.point(x)!;
      expectComplexClose(rot.point(x)!, complex(-p.im, p.re), 1e-15);
    }
  });

  it('keeps arc orientation, sweep and extent; only angles and points rotate', () => {
    const arc = resistanceCircleCurve(0).shape; // full circle
    expect(arc?.kind).toBe('circle');
    const path = evalAll(['p = linePath(z(2), 0.1, 0.3)']).byName('p').curve!;
    const before = path.shape!;
    const after = rotateShape(before, 0.7);
    if (before.kind !== 'arc' || after.kind !== 'arc') throw new Error('expected arcs');
    expect(after.sweep).toBe(before.sweep);
    expect(after.radius).toBe(before.radius);
    expect(after.startAngle).toBeCloseTo(before.startAngle + 0.7, 15);
    expect(arg(after.start)).toBeCloseTo(arg(before.start) + 0.7, 12);
  });

  it('2π is the identity; rotations add; |Γ| is preserved (curves stay inside the disc)', () => {
    const c = resistanceCircleCurve(0.4);
    const full = rotateCurve(c, 2 * Math.PI);
    const twice = rotateCurve(rotateCurve(c, 0.3), 0.5);
    const once = rotateCurve(c, 0.8);
    for (const x of [-2, 0, 3]) {
      expectComplexClose(full.point(x)!, c.point(x)!, 1e-14);
      expectComplexClose(twice.point(x)!, once.point(x)!, 1e-14);
      expect(abs(once.point(x)!)).toBeCloseTo(abs(c.point(x)!), 14);
    }
  });

  it('a half-turn is exact (no round-off): unitPhasor(π) = −1', () => {
    expect(unitPhasor(Math.PI)).toEqual(complex(-1, 0));
    expect(unitPhasor(-Math.PI / 2)).toEqual(complex(0, -1));
  });

  it('rotated exact curves still intersect analytically', () => {
    const r1 = resistanceCircleCurve(1);
    const result = intersectCurves(r1, rotateCurve(r1, Math.PI / 2));
    expect(result.points.map((p) => p.numerical)).toEqual([false, false]);
    expectComplexClose(result.points[0]!.gamma, complex(0, 0), 1e-12);
    expectComplexClose(result.points[1]!.gamma, complex(0.5, 0.5), 1e-12);
  });

  it('rotate() in expressions: radians; rotate(c, -4*pi*l) moves a curve along a line', () => {
    const { byName } = evalAll(['l = 0.1', 'c = rotate(gCircle(1), -4*pi*l)', 'p = rotate(vswrCircle(2), 1)']);
    const c = byName('c').curve!;
    expect(c).toMatchObject({ frame: 'number', domain: 'admittance' });
    expect(c.properties.at(-1)!.label).toBe('rotation');
    const base = evalAll(['g = gCircle(1)']).byName('g').curve!;
    expectComplexClose(c.point(0.5)!, reflectionThroughLine(base.point(0.5)!, 0.1), 1e-13);
  });

  it('rejects lengths (with the line hint), complex angles and non-curves', () => {
    const { byName } = evalAll(['lA = 0.1', 'a = rotate(rCircle(1), lA)', 'b = rotate(rCircle(1), j)', 'c = rotate(z(1), 1)']);
    expect(byName('a').error!.message).toMatch(/-4\*pi\*l/);
    expect(byName('b').error!.message).toMatch(/real number of radians/);
    expect(byName('c').error!.message).toMatch(/expects a curve/);
  });

  it('commutes with the mode transform', () => {
    const c = resistanceCircleCurve(0.7);
    const a = displayCurve(rotateCurve(c, 0.9), 'admittance');
    const b = rotateCurve(displayCurve(c, 'admittance'), 0.9);
    for (const x of [-1, 0.4, 2]) expectComplexClose(a.point(x)!, b.point(x)!, 1e-14);
  });

  it('rotating a radial guide recomputes its readings', () => {
    const g = radialGuideCurve(complex(0.5, 0));
    const r = rotateCurve(g, Math.PI / 2, { annotate: false });
    expect(r.properties.find((p) => p.label === '∠Γ')!.value).toBe('90°');
  });
});

describe('wavelength scales: three concentric rings', () => {
  const scale = buildWavelengthScale();

  it('inner ring < tick ring < outer ring, with each scale in its own strip', () => {
    const rIn = scale.innerRing.radius;
    const rMid = scale.tickRing.radius;
    const rOut = scale.outerRing.radius;
    expect(rIn).toBeGreaterThan(1);
    expect(rIn).toBeLessThan(rMid);
    expect(rMid).toBeLessThan(rOut);
    for (const l of scale.loadLabels) {
      expect(abs(l.anchor)).toBeGreaterThan(rIn);
      expect(abs(l.anchor)).toBeLessThan(rMid);
    }
    for (const l of scale.generatorLabels) {
      expect(abs(l.anchor)).toBeGreaterThan(rMid);
      expect(abs(l.anchor)).toBeLessThan(rOut);
    }
    // Titles are in their own strips.
    expect(scale.loadTitlePath.radius).toBeCloseTo(abs(scale.loadLabels[0]!.anchor), 12);
    expect(scale.generatorTitlePath.radius).toBeCloseTo(abs(scale.generatorLabels[0]!.anchor), 12);
  });

  it('ticks straddle the shared tick ring and stay clear of the numbers', () => {
    const rMid = scale.tickRing.radius;
    const textHalf = 0.014; // 28-unit labels at zoom 1
    for (const t of scale.ticks) {
      expect((abs(t.inner) + abs(t.outer)) / 2).toBeCloseTo(rMid, 12);
      expect(abs(t.inner)).toBeGreaterThan(abs(scale.loadLabels[0]!.anchor) + textHalf);
      expect(abs(t.outer)).toBeLessThan(abs(scale.generatorLabels[0]!.anchor) - textHalf);
    }
  });

  it('titles sit in the gap between two numbers', () => {
    const gap = (36 * Math.PI) / 180; // numbers every 0.05λ
    expect(Math.abs(scale.generatorTitlePath.sweep)).toBeLessThan(gap);
    expect(scale.generatorTitlePath.startAngle + scale.generatorTitlePath.sweep / 2).toBeCloseTo(Math.PI / 2, 12);
  });

  it('labels and titles are written upright along the circle', () => {
    expect(uprightTangentAngle(Math.PI / 2)).toBeCloseTo(0, 15); // top: horizontal
    expect(uprightTangentAngle(-Math.PI / 2)).toBeCloseTo(0, 15); // bottom: horizontal, not upside down
    expect(uprightTangentAngle(0.0001)).toBeCloseTo(-Math.PI / 2, 3); // right, upper side: reads downward
    expect(uprightTangentAngle(Math.PI - 0.0001)).toBeCloseTo(Math.PI / 2, 3); // left, upper side: reads upward
  });

  it('leaves room in the viewBox for guide readings outside the outer ring', () => {
    expect((scale.outerRing.radius + 0.12) * CHART_RADIUS).toBeLessThan(CHART_VIEWBOX.width / 2);
  });
});

describe('radial guide wavelength labels', () => {
  const LAYOUT = { outerRadius: 1.24, lineHeight: 0.04, gap: 0.01 };

  it('show WTG and WTL of the displayed angle for the selected guide, WTG only otherwise', () => {
    const end = complex(0, 1);
    const [sel] = guideAnnotations([{ id: 'a', end, selected: true }], LAYOUT);
    expect(sel!.wtg).toBeCloseTo(wavelengthsTowardGenerator(end)!, 15);
    expect(sel!.wtl).toBeCloseTo(wavelengthsTowardLoad(end)!, 15);
    expect(sel!.lines.map((l) => l.text)).toEqual(['WTG ↻ .125λ', 'WTL ↺ .375λ']);
    const [plain] = guideAnnotations([{ id: 'a', end, selected: false }], LAYOUT);
    expect(plain!.lines.map((l) => l.text)).toEqual(['↻ .125λ']);
  });

  it('extend the guide from the unit circle to the outer ring, with readings outside it on the guide', () => {
    const [a] = guideAnnotations([{ id: 'a', end: complex(-0.5, 0), selected: true }], LAYOUT);
    expectComplexClose(a!.boundary, complex(-1, 0));
    expectComplexClose(a!.extensionEnd, complex(-1.24, 0));
    for (const line of a!.lines) {
      expect(abs(line.position)).toBeGreaterThan(1.24);
      expect(arg(line.position)).toBeCloseTo(Math.PI, 12);
    }
    expect((abs(a!.lines[1]!.position) - abs(a!.lines[0]!.position)) ** 2).toBeCloseTo(0.04 ** 2, 12);
  });

  it('read top-to-bottom upright on both halves of the chart', () => {
    const [up] = guideAnnotations([{ id: 'u', end: complex(0, 1), selected: true }], LAYOUT);
    const [down] = guideAnnotations([{ id: 'd', end: complex(0, -1), selected: true }], LAYOUT);
    // Upper half: "up" is outward, so the first line is the outer one.
    expect(abs(up!.lines[0]!.position)).toBeGreaterThan(abs(up!.lines[1]!.position));
    // Lower half: "up" is inward, so the first line is the inner one.
    expect(abs(down!.lines[0]!.position)).toBeLessThan(abs(down!.lines[1]!.position));
    expect(up!.textAngle).toBeCloseTo(0, 15);
    expect(down!.textAngle).toBeCloseTo(0, 15);
  });

  it('stack nearby guides outward deterministically, the selected one innermost', () => {
    const e = (deg: number) => complex(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));
    const out = guideAnnotations(
      [
        { id: 'a', end: e(40), selected: false },
        { id: 'b', end: e(44), selected: true },
        { id: 'c', end: e(120), selected: false },
      ],
      LAYOUT,
    );
    const inner = (id: string) => Math.min(...out.find((x) => x.id === id)!.lines.map((l) => abs(l.position)));
    expect(inner('b')).toBeCloseTo(1.25 + 0.02, 12);
    expect(inner('a')).toBeCloseTo(1.25 + 2 * 0.04 + 0.02, 12);
    expect(inner('c')).toBeCloseTo(1.25 + 0.02, 12);
  });

  it('skip undefined guides (Γ = 0)', () => {
    expect(guideAnnotations([{ id: 'a', end: complex(0, 0), selected: true }], LAYOUT)).toEqual([]);
  });

  it('a guide on a y value reads λ/4 differently in the two modes; a plane guide does not', () => {
    const { shown } = evalAll(['zL = 0.6 + j0.8', 'yL = 1/zL', 'gammaL = gamma(zL)']);
    const read = (p: ReturnType<typeof shown>) => guideAnnotations([{ id: 'g', end: p, selected: true }], LAYOUT)[0]!.wtg;
    const dy = (read(shown('yL', 'impedance')) - read(shown('yL', 'admittance')) + 0.5) % 0.5;
    expect(dy).toBeCloseTo(0.25, 12);
    expect(read(shown('gammaL', 'impedance'))).toBeCloseTo(read(shown('gammaL', 'admittance')), 15);
  });

  it('follow their source when it moves', () => {
    let s = reduce(createWorkspace(), { type: 'point/create', id: 'p', gamma: complex(0, 0.5) });
    const before = guideAnnotations([{ id: 'g', end: resolveGamma(s, 'p')!, selected: true }], LAYOUT)[0]!.wtg;
    s = reduce(s, { type: 'point/move', id: 'p', gamma: complex(0.5, 0) });
    const after = guideAnnotations([{ id: 'g', end: resolveGamma(s, 'p')!, selected: true }], LAYOUT)[0]!.wtg;
    expect(before).toBeCloseTo(0.125, 12);
    expect(after).toBeCloseTo(0.25, 12);
  });
});
