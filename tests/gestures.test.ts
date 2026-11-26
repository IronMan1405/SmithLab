import { describe, expect, it } from 'vitest';
import { type Complex, abs, complex } from '../src/core';
import { DEFAULT_VIEW, type Rect, gammaToScreen, screenToGamma } from '../src/chart/viewport';
import {
  DRAG_THRESHOLD_PX,
  type Command,
  type Gesture,
  type GestureContext,
  IDLE,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  wheelZoomFactor,
} from '../src/interaction/gestures';
import { expectComplexClose } from './helpers';

const RECT: Rect = { left: 0, top: 0, width: 800, height: 800 };
const CTX: GestureContext = { rect: RECT, view: DEFAULT_VIEW, snap: true };
const NO_SNAP: GestureContext = { ...CTX, snap: false };

const at = (gamma: Complex) => gammaToScreen(gamma, RECT, DEFAULT_VIEW);
const down = (client: { x: number; y: number }, button = 0, pointerId = 1) => ({ pointerId, client, button });

function run(
  steps: ((g: Gesture) => { gesture: Gesture; commands: readonly Command[] })[],
): { gesture: Gesture; commands: Command[] } {
  let gesture: Gesture = IDLE;
  const commands: Command[] = [];
  for (const step of steps) {
    const t = step(gesture);
    gesture = t.gesture;
    commands.push(...t.commands);
  }
  return { gesture, commands };
}

describe('click on background', () => {
  it('creates a point at the clicked Γ inside the disc', () => {
    const p = at(complex(0.2, 0.4));
    const { gesture, commands } = run([
      (g) => pointerDown(g, down(p), null, CTX),
      (g) => pointerUp(g, { pointerId: 1, client: p }, CTX),
    ]);
    expect(gesture.kind).toBe('idle');
    expect(commands).toHaveLength(1);
    const cmd = commands[0]!;
    expect(cmd.type).toBe('create');
    if (cmd.type === 'create') expectComplexClose(cmd.gamma, complex(0.2, 0.4), 1e-12);
  });

  it('tolerates jitter below the drag threshold', () => {
    const p = at(complex(-0.3, -0.2));
    const jitter = { x: p.x + DRAG_THRESHOLD_PX - 1, y: p.y };
    const { commands } = run([
      (g) => pointerDown(g, down(p), null, CTX),
      (g) => pointerMove(g, { pointerId: 1, client: jitter }, CTX),
      (g) => pointerUp(g, { pointerId: 1, client: jitter }, CTX),
    ]);
    expect(commands.map((c) => c.type)).toEqual(['create']);
  });

  it('outside the disc clears the selection instead of creating', () => {
    const p = at(complex(1.05, 0.05));
    const { commands } = run([
      (g) => pointerDown(g, down(p), null, CTX),
      (g) => pointerUp(g, { pointerId: 1, client: p }, CTX),
    ]);
    expect(commands).toEqual([{ type: 'deselect' }]);
  });

  it('near the centre snaps to an exact matched load; Alt (no snap) does not', () => {
    const near = at(complex(0.004, 0.003));
    const snapped = run([(g) => pointerDown(g, down(near), null, CTX), (g) => pointerUp(g, { pointerId: 1, client: near }, CTX)]);
    expect(snapped.commands[0]).toEqual({ type: 'create', gamma: complex(0, 0) });
    const raw = run([(g) => pointerDown(g, down(near), null, NO_SNAP), (g) => pointerUp(g, { pointerId: 1, client: near }, NO_SNAP)]);
    const cmd = raw.commands[0]!;
    if (cmd.type !== 'create') throw new Error('expected create');
    expect(abs(cmd.gamma)).toBeGreaterThan(0);
  });
});

describe('drag on background pans and never creates', () => {
  it('turns into a pan beyond the threshold', () => {
    const start = at(complex(0, 0));
    const end = { x: start.x + 50, y: start.y };
    const { commands } = run([
      (g) => pointerDown(g, down(start), null, CTX),
      (g) => pointerMove(g, { pointerId: 1, client: end }, CTX),
      (g) => pointerUp(g, { pointerId: 1, client: end }, CTX),
    ]);
    expect(commands.map((c) => c.type)).toEqual(['view']);
    const view = (commands[0] as Extract<Command, { type: 'view' }>).view;
    // The chart point that was under the pointer is still under it.
    expectComplexClose(screenToGamma(end, RECT, view), complex(0, 0), 1e-12);
  });

  it('middle button pans immediately, even over a point', () => {
    const start = at(complex(0.5, 0));
    const t = pointerDown(IDLE, down(start, 1), { pointId: 'a', pointGamma: complex(0.5, 0) }, CTX);
    expect(t.gesture.kind).toBe('pan');
    expect(t.commands).toEqual([]);
  });

  it('ignores secondary (right) button', () => {
    const t = pointerDown(IDLE, down(at(complex(0, 0)), 2), null, CTX);
    expect(t.gesture).toBe(IDLE);
    expect(t.commands).toEqual([]);
  });
});

describe('point press and drag', () => {
  const target = { pointId: 'a', pointGamma: complex(0.3, 0.3) };

  it('pressing a point selects it; releasing without moving does not move it', () => {
    const p = at(target.pointGamma);
    const { commands } = run([
      (g) => pointerDown(g, down(p), target, CTX),
      (g) => pointerUp(g, { pointerId: 1, client: p }, CTX),
    ]);
    expect(commands).toEqual([{ type: 'select', id: 'a' }]);
  });

  it('dragging moves the point continuously with the grab offset preserved', () => {
    // Grab the point slightly off-centre: it must not jump to the cursor.
    const grab = { x: at(target.pointGamma).x + 3, y: at(target.pointGamma).y };
    const m1 = { x: grab.x + 20, y: grab.y - 10 };
    const m2 = { x: grab.x + 40, y: grab.y - 30 };
    const { gesture, commands } = run([
      (g) => pointerDown(g, down(grab), target, NO_SNAP),
      (g) => pointerMove(g, { pointerId: 1, client: m1 }, NO_SNAP),
      (g) => pointerMove(g, { pointerId: 1, client: m2 }, NO_SNAP),
    ]);
    expect(gesture.kind).toBe('drag-point');
    expect(commands.map((c) => c.type)).toEqual(['select', 'move', 'move']);
    const last = commands[2] as Extract<Command, { type: 'move' }>;
    const offset = screenToGamma(grab, RECT, DEFAULT_VIEW);
    const expected = complex(
      target.pointGamma.re + screenToGamma(m2, RECT, DEFAULT_VIEW).re - offset.re,
      target.pointGamma.im + screenToGamma(m2, RECT, DEFAULT_VIEW).im - offset.im,
    );
    expectComplexClose(last.gamma, expected, 1e-12);
  });

  it('a point drag never creates a point or pans on release', () => {
    const p = at(target.pointGamma);
    const far = { x: p.x + 100, y: p.y };
    const { commands } = run([
      (g) => pointerDown(g, down(p), target, CTX),
      (g) => pointerMove(g, { pointerId: 1, client: far }, CTX),
      (g) => pointerUp(g, { pointerId: 1, client: far }, CTX),
    ]);
    expect(commands.some((c) => c.type === 'create' || c.type === 'view')).toBe(false);
  });

  it('dragging beyond the boundary keeps the point on |Γ| = 1', () => {
    const p = at(target.pointGamma);
    const outside = at(complex(3, 3));
    const { commands } = run([
      (g) => pointerDown(g, down(p), target, NO_SNAP),
      (g) => pointerMove(g, { pointerId: 1, client: outside }, NO_SNAP),
    ]);
    const move = commands.at(-1) as Extract<Command, { type: 'move' }>;
    expect(abs(move.gamma)).toBeLessThanOrEqual(1);
    expect(abs(move.gamma)).toBeCloseTo(1, 12);
  });

  it('dragging near Γ = +1 snaps to an exact open circuit', () => {
    const p = at(target.pointGamma);
    const nearOpen = at(complex(0.995 + 0, 0.002));
    const grabOffsetFree = { ...target, pointGamma: screenToGamma(p, RECT, DEFAULT_VIEW) };
    const { commands } = run([
      (g) => pointerDown(g, down(p), grabOffsetFree, CTX),
      (g) => pointerMove(g, { pointerId: 1, client: nearOpen }, CTX),
    ]);
    expect((commands.at(-1) as Extract<Command, { type: 'move' }>).gamma).toEqual(complex(1, 0));
  });
});

describe('multi-pointer and cancellation', () => {
  it('ignores a second pointer while a gesture is active', () => {
    const first = pointerDown(IDLE, down(at(complex(0, 0)), 0, 1), null, CTX);
    const second = pointerDown(first.gesture, down(at(complex(0.5, 0)), 0, 2), null, CTX);
    expect(second.gesture).toBe(first.gesture);
    expect(pointerUp(first.gesture, { pointerId: 2, client: { x: 0, y: 0 } }, CTX).commands).toEqual([]);
  });

  it('cancel abandons a press without creating anything', () => {
    const t = pointerDown(IDLE, down(at(complex(0, 0))), null, CTX);
    const c = pointerCancel(t.gesture, 1);
    expect(c.gesture).toBe(IDLE);
    expect(c.commands).toEqual([]);
  });
});

describe('wheel zoom factor', () => {
  it('zooms in for negative deltaY and out for positive', () => {
    expect(wheelZoomFactor(-100, 0, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0, false)).toBeLessThan(1);
    expect(wheelZoomFactor(0, 0, false)).toBe(1);
  });

  it('treats line-mode deltas as larger and limits extreme deltas', () => {
    expect(wheelZoomFactor(-3, 1, false)).toBeCloseTo(wheelZoomFactor(-48, 0, false), 12);
    expect(wheelZoomFactor(-1e6, 0, false)).toBeCloseTo(wheelZoomFactor(-200, 0, false), 12);
  });
});
