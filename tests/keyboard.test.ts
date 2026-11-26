import { describe, expect, it } from 'vitest';
import { abs, complex } from '../src/core';
import { DEFAULT_VIEW } from '../src/chart/viewport';
import { NUDGE_STEP, commandForKey } from '../src/interaction/keyboard';
import type { WorkspacePoint } from '../src/workspace';
import { expectComplexClose } from './helpers';

const point: WorkspacePoint = { id: 'a', name: 'P1', gamma: complex(0.2, 0.2) };
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey });

describe('keyboard commands', () => {
  it('Delete/Backspace delete the selected point', () => {
    expect(commandForKey(key('Delete'), { selected: point, view: DEFAULT_VIEW })).toEqual({ type: 'delete', id: 'a' });
    expect(commandForKey(key('Backspace'), { selected: point, view: DEFAULT_VIEW })).toEqual({ type: 'delete', id: 'a' });
    expect(commandForKey(key('Delete'), { selected: null, view: DEFAULT_VIEW })).toBeNull();
  });

  it('arrows nudge the selected point, Shift ×10, scaled by zoom', () => {
    const up = commandForKey(key('ArrowUp'), { selected: point, view: DEFAULT_VIEW });
    expect(up).toMatchObject({ type: 'move', id: 'a' });
    if (up?.type === 'move') expectComplexClose(up.gamma, complex(0.2, 0.2 + NUDGE_STEP));
    const fast = commandForKey(key('ArrowLeft', true), { selected: point, view: { center: complex(0, 0), zoom: 2 } });
    if (fast?.type === 'move') expectComplexClose(fast.gamma, complex(0.2 - (10 * NUDGE_STEP) / 2, 0.2));
    expect(commandForKey(key('ArrowUp'), { selected: null, view: DEFAULT_VIEW })).toBeNull();
  });

  it('nudging cannot leave the disc', () => {
    const edge: WorkspacePoint = { ...point, gamma: complex(1, 0) };
    const right = commandForKey(key('ArrowRight', true), { selected: edge, view: DEFAULT_VIEW });
    if (right?.type !== 'move') throw new Error('expected move');
    expect(abs(right.gamma)).toBeLessThanOrEqual(1);
  });

  it('zoom keys and fit', () => {
    const zin = commandForKey(key('+'), { selected: null, view: DEFAULT_VIEW });
    expect(zin?.type === 'view' && zin.view.zoom).toBeGreaterThan(1);
    const zout = commandForKey(key('-'), { selected: null, view: DEFAULT_VIEW });
    expect(zout?.type === 'view' && zout.view.zoom).toBeLessThan(1);
    const fit = commandForKey(key('0'), { selected: null, view: { center: complex(0.5, 0), zoom: 9 } });
    expect(fit).toEqual({ type: 'view', view: DEFAULT_VIEW });
  });

  it('Escape deselects; unrelated keys do nothing', () => {
    expect(commandForKey(key('Escape'), { selected: point, view: DEFAULT_VIEW })).toEqual({ type: 'deselect' });
    expect(commandForKey(key('q'), { selected: point, view: DEFAULT_VIEW })).toBeNull();
  });
});
