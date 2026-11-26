import { describe, expect, it } from 'vitest';
import { abs, arg, complex, reflectionFromAdmittance, reflectionFromImpedance, reflectionThroughLine, sub } from '../src/core';
import { DEFAULT_VIEW } from '../src/chart/viewport';
import {
  type ExpressionDef,
  createExpressionDef,
  evaluateExpressions,
  lineConstruction,
  plottedGamma,
  withSliderValue,
} from '../src/expressions';
import {
  type ChartLabel,
  chartLabels,
  intersectCurves,
  radialGuideCurve,
  vswrCircleCurve,
  wavelengthsTowardGenerator,
} from '../src/geometry';
import { commandForKey } from '../src/interaction/keyboard';
import { createWorkspace, resolveGamma, workspaceReducer as reduce } from '../src/workspace';
import { expectComplexClose } from './helpers';

/** Approximate on-chart text position: anchor pushed 0.04 along its direction. */
const textAt = (l: ChartLabel) => complex(l.anchor.re + 0.04 * l.direction.re, l.anchor.im + 0.04 * l.direction.im);

describe('grid labels', () => {
  it('impedance grid only: resistance and reactance labels, no admittance labels', () => {
    const roles = new Set(chartLabels({ impedance: true, admittance: false }).map((l) => l.role));
    expect(roles.has('resistance') && roles.has('reactance')).toBe(true);
    expect(roles.has('conductance') || roles.has('susceptance')).toBe(false);
  });

  it('admittance grid only: conductance and susceptance labels are shown', () => {
    const labels = chartLabels({ impedance: false, admittance: true });
    expect(labels.filter((l) => l.role === 'conductance').map((l) => l.text)).toEqual(['0.2', '0.5', '1', '2', '5', '10']);
    expect(labels.filter((l) => l.role === 'susceptance')).toHaveLength(12);
    expect(labels.some((l) => l.role === 'resistance' || l.role === 'reactance')).toBe(false);
    // Axis ends for g: 0 at the open end (Γ = +1), ∞ at the short (Γ = −1).
    const ends = labels.filter((l) => l.role === 'axis-end');
    expect(ends.find((l) => l.text === '0')!.anchor).toEqual(complex(1, 0));
    expect(ends.find((l) => l.text === '∞')!.anchor).toEqual(complex(-1, 0));
  });

  it('conductance labels sit at Γ_y(g) — the mirror of the resistance scale', () => {
    const g2 = chartLabels({ impedance: false, admittance: true }).find((l) => l.id === 'label-g:2')!;
    expectComplexClose(g2.anchor, reflectionFromAdmittance(complex(2, 0)));
    expectComplexClose(g2.anchor, complex(-1 / 3, 0));
  });

  it('positive susceptance (capacitive) is labelled in the lower half, negative in the upper', () => {
    for (const l of chartLabels({ impedance: false, admittance: true }).filter((x) => x.role === 'susceptance')) {
      const b = Number(l.id.split(':')[1]);
      expect(Math.sign(l.anchor.im)).toBe(-Math.sign(b));
      expect(abs(l.anchor)).toBeCloseTo(1, 12);
      expect(l.text.startsWith('−') ? -1 : 1).toBe(Math.sign(b));
    }
    const b1 = chartLabels({ impedance: false, admittance: true }).find((l) => l.id === 'label-b:1')!;
    expectComplexClose(b1.anchor, complex(0, -1));
  });

  it('both grids: no two labels overprint; g goes below the axis and b inside the boundary', () => {
    const labels = chartLabels({ impedance: true, admittance: true });
    for (const l of labels.filter((x) => x.role === 'conductance')) expect(l.direction.im).toBeLessThan(0);
    for (const l of labels.filter((x) => x.role === 'susceptance')) {
      expect(l.direction.re * l.anchor.re + l.direction.im * l.anchor.im).toBeLessThan(0); // points inward
    }
    // Axis ends appear once.
    expect(labels.filter((l) => l.role === 'axis-end')).toHaveLength(2);
    // Pairwise separation of text positions.
    for (let i = 0; i < labels.length; i++) {
      for (let k = i + 1; k < labels.length; k++) {
        const d = abs(sub(textAt(labels[i]!), textAt(labels[k]!)));
        expect(d, `${labels[i]!.id} vs ${labels[k]!.id}`).toBeGreaterThan(0.02);
      }
    }
  });

  it('without placement rules, admittance labels would collide (g = 0.2 vs r = 5, b = 0.5 vs x = −2)', () => {
    const z = chartLabels({ impedance: true, admittance: false });
    const y = chartLabels({ impedance: false, admittance: true });
    expectComplexClose(y.find((l) => l.id === 'label-g:0.2')!.anchor, z.find((l) => l.id === 'label-r:5')!.anchor);
    expectComplexClose(y.find((l) => l.id === 'label-b:0.5')!.anchor, z.find((l) => l.id === 'label-x:-2')!.anchor);
  });
});

const def = (id: string, text: string, extra: Partial<ExpressionDef> = {}) => ({ ...createExpressionDef(id, text), ...extra });

describe('transmission line from an expression point', () => {
  it('generates a length variable and a line() expression with type-consistent names', () => {
    const c = lineConstruction({ name: 'zL', type: 'impedance' }, new Set(['zL']))!;
    expect(c).toEqual({
      lengthName: 'l_zL',
      lengthText: 'l_zL = 0.125',
      lengthSlider: { min: 0, max: 0.5, step: 0.001 },
      resultName: 'zL_in',
      resultText: 'zL_in = line(zL, l_zL)',
    });
    expect(lineConstruction({ name: 'gammaL', type: 'reflection' }, new Set())!.resultName).toBe('gammaL_in');
    expect(lineConstruction({ name: 'p1', type: 'reflection' }, new Set())!.resultText).toBe('p1_in = line(p1, l_p1)');
  });

  it('avoids existing names', () => {
    const c = lineConstruction({ name: 'zL', type: 'impedance' }, new Set(['zL', 'l_zL', 'zL_in']))!;
    expect(c.lengthName).toBe('l_zL2');
    expect(c.resultName).toBe('zL_in2');
  });

  it('refuses unnamed sources and types without a chart position', () => {
    expect(lineConstruction({ name: null, type: 'impedance' }, new Set())).toBeNull();
    expect(lineConstruction({ name: 'k', type: 'complex' }, new Set())).toBeNull();
    expect(lineConstruction({ name: 'l', type: 'length' }, new Set())).toBeNull();
  });

  it('the generated expressions evaluate through the existing line() function', () => {
    for (const [text, name, type] of [
      ['zL = 0.5 + j1.2', 'zL', 'impedance'],
      ['gammaL = 0.3 + j0.4', 'gammaL', 'reflection'],
      ['yL = 1 - j0.5', 'yL', 'admittance'],
      ['ZL = 25 + j60', 'ZL', 'physicalImpedance'],
    ] as const) {
      const c = lineConstruction({ name, type }, new Set([name]))!;
      const out = evaluateExpressions([def('s', text), def('l', c.lengthText), def('r', c.resultText)], 50);
      const r = out.results.get('r')!;
      expect(r.status, `${text}: ${r.error?.message}`).toBe('ok');
      expect(r.value!.type).toBe(type);
      expectComplexClose(plottedGamma(r)!, reflectionThroughLine(plottedGamma(out.results.get('s'))!, 0.125), 1e-12);
    }
  });

  it('upstream and slider changes propagate; the source expression is untouched', () => {
    const c = lineConstruction({ name: 'zL', type: 'impedance' }, new Set(['zL']))!;
    const list = [def('s', 'zL = 2'), def('l', c.lengthText), def('r', c.resultText)];
    const first = evaluateExpressions(list, 50);
    expectComplexClose(plottedGamma(first.results.get('r'))!, complex(0, -1 / 3), 1e-12);
    const moved = evaluateExpressions(list.map((d) => (d.id === 's' ? { ...d, text: 'zL = 0.5' } : d)), 50, first);
    expectComplexClose(plottedGamma(moved.results.get('r'))!, complex(0, 1 / 3), 1e-12);
    const slid = list.map((d) => (d.id === 'l' ? { ...d, text: withSliderValue(d.text, 0.25, 0.001)! } : d));
    const quarter = evaluateExpressions(slid, 50, first);
    expect([...quarter.recomputed].sort()).toEqual(['l', 'r']);
    expectComplexClose(quarter.results.get('r')!.value!.value, complex(0.5, 0), 1e-12); // λ/4: z_in = 1/z_L
  });

  it('the result can itself take another line (chain)', () => {
    const c1 = lineConstruction({ name: 'zL', type: 'impedance' }, new Set(['zL']))!;
    const c2 = lineConstruction({ name: c1.resultName, type: 'impedance' }, new Set(['zL', c1.lengthName, c1.resultName]))!;
    expect(c2.resultText).toBe('zL_in_in = line(zL_in, l_zL_in)');
    const out = evaluateExpressions(
      [def('s', 'zL = 2'), def('a', c1.lengthText), def('b', c1.resultText), def('c', c2.lengthText), def('d', c2.resultText)],
      50,
    );
    expectComplexClose(plottedGamma(out.results.get('d'))!, reflectionThroughLine(complex(1 / 3, 0), 0.25), 1e-12);
  });
});

describe('radial guide geometry', () => {
  it('is the segment from the centre to the boundary at ∠Γ', () => {
    const g = complex(0.3, 0.4);
    const c = radialGuideCurve(g);
    expect(c.shape?.kind).toBe('segment');
    if (c.shape?.kind !== 'segment') return;
    expect(c.shape.start).toEqual(complex(0, 0));
    expect(abs(c.shape.end)).toBeCloseTo(1, 15); // ends exactly on the unit circle
    expect(arg(c.shape.end)).toBeCloseTo(arg(g), 15);
    expectComplexClose(c.point(0.5)!, g, 1e-12); // passes through the point
    expect(c.point(1.2)).toBeNull(); // nothing beyond the boundary
  });

  it('reports the phase angle and wavelength readings', () => {
    const c = radialGuideCurve(complex(0, 0.5));
    expect(c.properties.find((p) => p.label === '∠Γ')!.value).toBe('90°');
    expect(c.properties.find((p) => p.label === 'WTG')!.value).toBe(`${wavelengthsTowardGenerator(complex(0, 1))}λ`);
  });

  it('negative angles point into the lower half', () => {
    const c = radialGuideCurve(reflectionFromImpedance(complex(1, -1)));
    if (c.shape?.kind === 'segment') expect(c.shape.end.im).toBeLessThan(0);
  });

  it('is undefined at the matched point', () => {
    expect(() => radialGuideCurve(complex(0, 0))).toThrow(RangeError);
  });

  it('meets a VSWR circle where |Γ| equals its radius on the same ray', () => {
    const g = complex(0.3, 0.4);
    const r = intersectCurves(radialGuideCurve(g), vswrCircleCurve(0.8, 9));
    expect(r.points).toHaveLength(1);
    expectComplexClose(r.points[0]!.gamma, complex(0.48, 0.64), 1e-12);
  });

  it('is available as radial(x) in expressions and follows its source', () => {
    const list = [def('z', 'zL = 0.5 + j1.2'), def('r', 'g1 = radial(zL)')];
    const first = evaluateExpressions(list, 50);
    const c = first.results.get('r')!.curve!;
    expect(c.kind).toBe('radialGuide');
    const second = evaluateExpressions(list.map((d) => (d.id === 'z' ? { ...d, text: 'zL = 2' } : d)), 50, first);
    const s = second.results.get('r')!.curve!.shape;
    expect(s?.kind === 'segment' && s.end).toEqual(complex(1, 0));
    expect(evaluateExpressions([def('z', 'zM = 1'), def('r', 'g = radial(zM)')], 50).results.get('r')!.error!.message).toMatch(/matched point/);
  });
});

describe('radial guides in the workspace', () => {
  const base = () => {
    let s = reduce(createWorkspace(), { type: 'point/create', id: 'p', gamma: complex(0.3, 0.4) });
    s = reduce(s, { type: 'guide/add', id: 'g', sourceId: 'p' });
    return s;
  };

  it('is created from a point, selected, and linked by id', () => {
    const s = base();
    expect(s.guides).toEqual([{ id: 'g', sourceId: 'p', visible: true }]);
    expect(s.selectedId).toBe('g');
    expect(() => reduce(s, { type: 'guide/add', id: 'h', sourceId: 'nope' })).toThrow();
    expect(() => reduce(s, { type: 'guide/add', id: 'g', sourceId: 'p' })).toThrow();
  });

  it('follows its source when the point moves (geometry is derived, not stored)', () => {
    let s = base();
    s = reduce(s, { type: 'point/move', id: 'p', gamma: complex(-0.5, 0) });
    const c = radialGuideCurve(resolveGamma(s, s.guides[0]!.sourceId)!);
    expect(c.shape?.kind === 'segment' && c.shape.end).toEqual(complex(-1, 0));
  });

  it('works on line-input points too', () => {
    let s = base();
    s = reduce(s, { type: 'line/add', id: 'in', sourceId: 'p', length: 0.125 });
    s = reduce(s, { type: 'guide/add', id: 'g2', sourceId: 'in' });
    expectComplexClose(resolveGamma(s, 'in')!, complex(0.4, -0.3));
    // Deleting the load removes its line and both guides.
    s = reduce(s, { type: 'point/delete', id: 'p' });
    expect(s.guides).toEqual([]);
  });

  it('toggles visibility and is deleted through point/delete (also by the Delete key)', () => {
    let s = base();
    s = reduce(s, { type: 'guide/set-visible', id: 'g', visible: false });
    expect(s.guides[0]!.visible).toBe(false);
    expect(commandForKey({ key: 'Delete', shiftKey: false }, { selected: null, view: DEFAULT_VIEW, deletableId: 'g' })).toEqual({ type: 'delete', id: 'g' });
    s = reduce(s, { type: 'point/delete', id: 'g' });
    expect(s.guides).toEqual([]);
    expect(s.selectedId).toBeNull();
    expect(s.points).toHaveLength(1); // the source point stays
  });

  it('is removed with its source expression, and by clearing points', () => {
    let s = reduce(createWorkspace(), { type: 'expression/add', id: 'e', text: 'zL = 2' });
    s = reduce(s, { type: 'guide/add', id: 'g', sourceId: 'e' });
    s = reduce(s, { type: 'expression/remove', id: 'e' });
    expect(s.guides).toEqual([]);
    let t = reduce(createWorkspace(), { type: 'point/create', id: 'p', gamma: complex(0.2, 0) });
    t = reduce(t, { type: 'guide/add', id: 'g', sourceId: 'p' });
    t = reduce(t, { type: 'points/clear' });
    expect(t.guides).toEqual([]);
  });

  it('selection can move between guide and source', () => {
    let s = base();
    s = reduce(s, { type: 'point/select', id: 'p' });
    expect(s.selectedId).toBe('p');
    s = reduce(s, { type: 'point/select', id: 'g' });
    expect(s.selectedId).toBe('g');
  });
});
