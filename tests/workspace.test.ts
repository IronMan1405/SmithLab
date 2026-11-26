import { describe, expect, it } from 'vitest';
import { abs, complex } from '../src/core';
import {
  type WorkspaceState,
  clampToDisc,
  createPointId,
  createWorkspace,
  selectedPoint,
  snapToLandmark,
  workspaceReducer as reduce,
} from '../src/workspace';
import { expectComplexClose } from './helpers';

function withPoints(...gammas: [string, number, number][]): WorkspaceState {
  return gammas.reduce(
    (s, [id, re, im]) => reduce(s, { type: 'point/create', id, gamma: complex(re, im) }),
    createWorkspace(),
  );
}

describe('workspace: creation', () => {
  it('starts empty with Z₀ = 50 Ω', () => {
    const s = createWorkspace();
    expect(s.points).toEqual([]);
    expect(s.selectedId).toBeNull();
    expect(s.z0).toBe(50);
  });

  it('creates points with stable ids, default names, and selects the new point', () => {
    const s = withPoints(['a', 0.2, 0.4], ['b', -0.5, 0]);
    expect(s.points.map((p) => p.id)).toEqual(['a', 'b']);
    expect(s.points.map((p) => p.name)).toEqual(['P1', 'P2']);
    expect(s.selectedId).toBe('b');
    expectComplexClose(s.points[0]!.gamma, complex(0.2, 0.4));
  });

  it('never reuses default names after deletion', () => {
    let s = withPoints(['a', 0, 0], ['b', 0.1, 0]);
    s = reduce(s, { type: 'point/delete', id: 'b' });
    s = reduce(s, { type: 'point/create', id: 'c', gamma: complex(0.3, 0) });
    expect(s.points.map((p) => p.name)).toEqual(['P1', 'P3']);
  });

  it('clamps points created outside the disc onto the boundary', () => {
    const s = withPoints(['a', 3, 4]);
    expect(abs(s.points[0]!.gamma)).toBeLessThanOrEqual(1);
    expectComplexClose(s.points[0]!.gamma, complex(0.6, 0.8));
  });

  it('rejects duplicate ids and NaN', () => {
    const s = withPoints(['a', 0, 0]);
    expect(() => reduce(s, { type: 'point/create', id: 'a', gamma: complex(0, 0) })).toThrow();
    expect(() => reduce(s, { type: 'point/create', id: 'z', gamma: complex(NaN, 0) })).toThrow(RangeError);
  });

  it('generates distinct ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, createPointId));
    expect(ids.size).toBe(1000);
  });
});

describe('workspace: move, select, rename', () => {
  it('moves only the addressed point, keeping identity and name', () => {
    const s0 = withPoints(['a', 0, 0], ['b', 0.5, 0]);
    const s1 = reduce(s0, { type: 'point/move', id: 'a', gamma: complex(0.1, -0.2) });
    expectComplexClose(s1.points[0]!.gamma, complex(0.1, -0.2));
    expect(s1.points[0]!.name).toBe('P1');
    expect(s1.points[1]).toBe(s0.points[1]);
  });

  it('keeps moved points inside the disc', () => {
    const s = reduce(withPoints(['a', 0, 0]), { type: 'point/move', id: 'a', gamma: complex(0, -5) });
    expectComplexClose(s.points[0]!.gamma, complex(0, -1));
  });

  it('ignores moves of unknown ids', () => {
    const s = withPoints(['a', 0, 0]);
    expect(reduce(s, { type: 'point/move', id: 'nope', gamma: complex(0.1, 0) })).toBe(s);
  });

  it('selects existing points, deselects with null, ignores unknown ids', () => {
    let s = withPoints(['a', 0, 0], ['b', 0.5, 0]);
    s = reduce(s, { type: 'point/select', id: 'a' });
    expect(selectedPoint(s)?.id).toBe('a');
    expect(reduce(s, { type: 'point/select', id: 'ghost' })).toBe(s);
    s = reduce(s, { type: 'point/select', id: null });
    expect(selectedPoint(s)).toBeNull();
  });

  it('renames with trimming, and rejects empty names', () => {
    let s = withPoints(['a', 0, 0]);
    s = reduce(s, { type: 'point/rename', id: 'a', name: '  Load A  ' });
    expect(s.points[0]!.name).toBe('Load A');
    s = reduce(s, { type: 'point/rename', id: 'a', name: '   ' });
    expect(s.points[0]!.name).toBe('Load A');
  });
});

describe('workspace: deletion', () => {
  it('deletes the selected point and clears selection', () => {
    let s = withPoints(['a', 0, 0], ['b', 0.5, 0]);
    s = reduce(s, { type: 'point/delete', id: 'b' });
    expect(s.points.map((p) => p.id)).toEqual(['a']);
    expect(s.selectedId).toBeNull();
  });

  it('deleting an unselected point keeps the selection', () => {
    let s = withPoints(['a', 0, 0], ['b', 0.5, 0]);
    s = reduce(s, { type: 'point/delete', id: 'a' });
    expect(s.selectedId).toBe('b');
  });

  it('clears all points', () => {
    const s = reduce(withPoints(['a', 0, 0], ['b', 0.5, 0]), { type: 'points/clear' });
    expect(s.points).toEqual([]);
    expect(s.selectedId).toBeNull();
  });
});

describe('workspace: Z₀', () => {
  it('changes Z₀ without moving any point', () => {
    const s0 = withPoints(['a', 0.2, 0.4]);
    const s1 = reduce(s0, { type: 'z0/set', z0: 75 });
    expect(s1.z0).toBe(75);
    expect(s1.points).toBe(s0.points);
  });

  it('rejects invalid Z₀', () => {
    const s = createWorkspace();
    for (const z0 of [0, -50, NaN, Infinity]) {
      expect(() => reduce(s, { type: 'z0/set', z0 })).toThrow(RangeError);
    }
    expect(() => createWorkspace(0)).toThrow(RangeError);
  });
});

describe('disc constraints', () => {
  it('leaves interior points unchanged and projects exterior points radially', () => {
    const inside = complex(0.3, -0.4);
    expect(clampToDisc(inside)).toBe(inside);
    const clamped = clampToDisc(complex(-2, 2));
    expect(abs(clamped)).toBeLessThanOrEqual(1);
    expect(abs(clamped)).toBeCloseTo(1, 15);
    expect(clamped.re).toBeCloseTo(-Math.SQRT1_2, 15);
  });

  it('snaps to matched, short and open within tolerance only', () => {
    expect(snapToLandmark(complex(0.004, -0.003), 0.01)).toEqual(complex(0, 0));
    expect(snapToLandmark(complex(-0.995, 0.001), 0.01)).toEqual(complex(-1, 0));
    expect(snapToLandmark(complex(0.999, 0), 0.01)).toEqual(complex(1, 0));
    const far = complex(0.5, 0.5);
    expect(snapToLandmark(far, 0.01)).toBe(far);
  });
});
