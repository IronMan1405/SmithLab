import { describe, expect, it } from 'vitest';
import { abs, arg, complex, reflectionThroughLine, vswrFromReflection } from '../src/core';
import {
  type WorkspaceState,
  createWorkspace,
  dependentsOf,
  pointQuantities,
  resolveGamma,
  resolvePoint,
  resolvePoints,
  workspaceReducer as reduce,
} from '../src/workspace';
import { expectComplexClose } from './helpers';

const LOAD = complex(0.3, 0.4);

function withLine(length = 0.125): WorkspaceState {
  let s = reduce(createWorkspace(), { type: 'point/create', id: 'load', gamma: LOAD });
  s = reduce(s, { type: 'line/add', id: 'in', sourceId: 'load', length });
  return s;
}

describe('creating a derived point', () => {
  it('references its source by id and stores only the transform', () => {
    const s = withLine();
    expect(s.derived).toEqual([{ id: 'in', name: 'P1 in', sourceId: 'load', transform: { type: 'line', length: 0.125 } }]);
    expect('gamma' in s.derived[0]!).toBe(false);
    expect(s.points).toHaveLength(1); // the load is untouched
    expectComplexClose(s.points[0]!.gamma, LOAD);
  });

  it('is selected after creation and resolves through the line', () => {
    const s = withLine(0.125);
    expect(s.selectedId).toBe('in');
    expectComplexClose(resolveGamma(s, 'in')!, complex(0.4, -0.3));
    const resolved = resolvePoint(s, 'in')!;
    expect(resolved.role).toBe('derived');
    expect(resolved.sourceId).toBe('load');
  });

  it('rejects unknown sources, duplicate ids and non-finite lengths', () => {
    const s = withLine();
    expect(() => reduce(s, { type: 'line/add', id: 'x', sourceId: 'ghost', length: 0.1 })).toThrow();
    expect(() => reduce(s, { type: 'line/add', id: 'in', sourceId: 'load', length: 0.1 })).toThrow();
    expect(() => reduce(s, { type: 'line/add', id: 'x', sourceId: 'load', length: NaN })).toThrow(RangeError);
    expect(() => reduce(s, { type: 'point/create', id: 'in', gamma: LOAD })).toThrow();
  });

  it('lists plotted points first, then derived points', () => {
    expect(resolvePoints(withLine()).map((p) => [p.id, p.role])).toEqual([
      ['load', 'source'],
      ['in', 'derived'],
    ]);
  });
});

describe('dependency on the source', () => {
  it('updates when the source moves', () => {
    let s = withLine(0.25);
    s = reduce(s, { type: 'point/move', id: 'load', gamma: complex(-0.5, 0.1) });
    expectComplexClose(resolveGamma(s, 'in')!, complex(0.5, -0.1));
    expect(s.derived[0]!.transform).toEqual({ type: 'line', length: 0.25 });
  });

  it('keeps |Γ| and VSWR equal to the load for any length', () => {
    for (const length of [0, 0.07, 0.25, 0.5, 1.3, -0.2]) {
      const s = withLine(length);
      const qIn = pointQuantities(resolveGamma(s, 'in')!, s.z0);
      const qLoad = pointQuantities(LOAD, s.z0);
      expect(qIn.gammaMagnitude).toBeCloseTo(qLoad.gammaMagnitude, 14);
      expect(qIn.vswr).toBeCloseTo(qLoad.vswr, 12);
    }
  });

  it('λ/4 line on z = 2 gives z_in = 0.5; λ/2 gives the load back', () => {
    let s = reduce(createWorkspace(), { type: 'point/create', id: 'load', gamma: complex(1 / 3, 0) });
    s = reduce(s, { type: 'line/add', id: 'q', sourceId: 'load', length: 0.25 });
    s = reduce(s, { type: 'line/add', id: 'h', sourceId: 'load', length: 0.5 });
    expectComplexClose(pointQuantities(resolveGamma(s, 'q')!, 50).z, complex(0.5, 0), 1e-12);
    expectComplexClose(pointQuantities(resolveGamma(s, 'h')!, 50).z, complex(2, 0), 1e-12);
  });

  it('supports chains: a derived point may be the source of another', () => {
    let s = withLine(0.1);
    s = reduce(s, { type: 'line/add', id: 'in2', sourceId: 'in', length: 0.15 });
    expectComplexClose(resolveGamma(s, 'in2')!, reflectionThroughLine(LOAD, 0.25), 1e-14);
    expect(dependentsOf(s, 'load')).toEqual(['in', 'in2']);
  });
});

describe('line length', () => {
  it('sets length, including beyond ½λ and negative values', () => {
    let s = withLine();
    for (const length of [0, 0.3, 0.75, -0.1]) {
      s = reduce(s, { type: 'line/set-length', id: 'in', length });
      expect(s.derived[0]!.transform.length).toBe(length);
      expectComplexClose(resolveGamma(s, 'in')!, reflectionThroughLine(LOAD, length), 1e-14);
    }
  });

  it('ignores unknown ids and rejects non-finite lengths', () => {
    const s = withLine();
    expect(reduce(s, { type: 'line/set-length', id: 'nope', length: 0.2 })).toBe(s);
    expect(() => reduce(s, { type: 'line/set-length', id: 'in', length: Infinity })).toThrow(RangeError);
  });

  it('dragging the input point rotates it along its circle by changing the length', () => {
    let s = withLine(0.1);
    // Aim at the direction λ/8 from the load (|target| need not match).
    const target = reflectionThroughLine(complex(0.6, 0.8), 0.125);
    s = reduce(s, { type: 'point/move', id: 'in', gamma: target });
    expect(s.derived[0]!.transform.length).toBeCloseTo(0.125, 12);
    expect(abs(resolveGamma(s, 'in')!)).toBeCloseTo(0.5, 14); // stays on the |Γ_L| circle
    expect(s.points[0]!.gamma).toEqual(LOAD); // the load is not moved
  });

  it('dragging continues smoothly past ½λ', () => {
    let s = withLine(0.49);
    s = reduce(s, { type: 'point/move', id: 'in', gamma: reflectionThroughLine(LOAD, 0.02) });
    expect(s.derived[0]!.transform.length).toBeCloseTo(0.52, 12);
  });

  it('dragging toward Γ = 0 leaves the length unchanged', () => {
    const s = withLine(0.2);
    expect(reduce(s, { type: 'point/move', id: 'in', gamma: complex(0, 0) })).toBe(s);
  });
});

describe('removing and recreating', () => {
  it('removing the line keeps the load', () => {
    const s = reduce(withLine(), { type: 'point/delete', id: 'in' });
    expect(s.derived).toEqual([]);
    expect(s.points.map((p) => p.id)).toEqual(['load']);
    expect(s.selectedId).toBeNull();
  });

  it('a line can be recreated on the same load', () => {
    let s = reduce(withLine(), { type: 'point/delete', id: 'in' });
    s = reduce(s, { type: 'line/add', id: 'in-2', sourceId: 'load', length: 0.2 });
    expectComplexClose(resolveGamma(s, 'in-2')!, reflectionThroughLine(LOAD, 0.2));
  });

  it('deleting the load removes its dependent lines', () => {
    let s = withLine();
    s = reduce(s, { type: 'line/add', id: 'in2', sourceId: 'in', length: 0.1 });
    s = reduce(s, { type: 'point/select', id: 'in2' });
    s = reduce(s, { type: 'point/delete', id: 'load' });
    expect(s.points).toEqual([]);
    expect(s.derived).toEqual([]);
    expect(s.selectedId).toBeNull();
  });

  it('clear all removes derived points too', () => {
    const s = reduce(withLine(), { type: 'points/clear' });
    expect(s.derived).toEqual([]);
  });

  it('derived points can be renamed', () => {
    const s = reduce(withLine(), { type: 'point/rename', id: 'in', name: 'Z_in' });
    expect(s.derived[0]!.name).toBe('Z_in');
  });
});

describe('characteristic impedance', () => {
  it('changing Z₀ rescales physical input impedance; normalised values and the line are unchanged', () => {
    const s50 = withLine(0.1);
    const s75 = reduce(s50, { type: 'z0/set', z0: 75 });
    expect(s75.derived).toBe(s50.derived);
    const q50 = pointQuantities(resolveGamma(s50, 'in')!, s50.z0);
    const q75 = pointQuantities(resolveGamma(s75, 'in')!, s75.z0);
    expectComplexClose(q50.z, q75.z);
    expectComplexClose(q75.impedance, complex(q50.z.re * 75, q50.z.im * 75), 1e-12);
    expect(arg(resolveGamma(s75, 'in')!)).toBeCloseTo(arg(resolveGamma(s50, 'in')!), 15);
    expect(vswrFromReflection(resolveGamma(s75, 'in')!)).toBeCloseTo(q50.vswr, 12);
  });
});

describe('near the boundary', () => {
  it('a lossless load stays on |Γ| = 1 through the line', () => {
    let s = reduce(createWorkspace(), { type: 'point/create', id: 'l', gamma: complex(0, 5) }); // clamped to Γ = j
    s = reduce(s, { type: 'line/add', id: 'i', sourceId: 'l', length: 0.07 });
    const q = pointQuantities(resolveGamma(s, 'i')!, 50);
    expect(q.kind).toBe('lossless');
    expect(q.z.re).toBe(0);
    expect(q.vswr).toBe(Infinity);
  });

  it('a short circuit through λ/4 becomes an exact open circuit', () => {
    let s = reduce(createWorkspace(), { type: 'point/create', id: 'l', gamma: complex(-1, 0) });
    s = reduce(s, { type: 'line/add', id: 'i', sourceId: 'l', length: 0.25 });
    expect(pointQuantities(resolveGamma(s, 'i')!, 50).kind).toBe('open');
  });

  it('a matched load is unaffected by any line', () => {
    let s = reduce(createWorkspace(), { type: 'point/create', id: 'l', gamma: complex(0, 0) });
    s = reduce(s, { type: 'line/add', id: 'i', sourceId: 'l', length: 0.17 });
    expect(pointQuantities(resolveGamma(s, 'i')!, 50).kind).toBe('matched');
  });
});
