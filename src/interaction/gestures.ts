/**
 * Pointer gesture state machine for the chart (pure; no DOM, no React).
 *
 * Rules
 * -----
 *  - Primary-button press on a point  → selects it immediately. Moving more
 *    than DRAG_THRESHOLD_PX turns the press into a drag; a press that never
 *    crosses the threshold leaves the point exactly where it was.
 *  - Primary-button press on the background → on release without crossing
 *    the threshold it is a click: inside the unit disc it creates a point,
 *    outside it clears the selection. Crossing the threshold turns it into a
 *    pan, and the release then does nothing. A drag can therefore never
 *    create a point by accident.
 *  - Middle-button press anywhere → pan immediately.
 *  - Any other button, or a second pointer while a gesture is active, is
 *    ignored.
 *  - While dragging, the point follows the pointer with the original grab
 *    offset (no jump on pickup), is clamped to |Γ| ≤ 1, and snaps to the
 *    matched/short/open landmarks within SNAP_RADIUS_PX unless snapping is off.
 *
 * Each transition returns the next gesture state plus a list of commands for
 * the caller to apply to workspace and view state.
 */
import { type Complex, abs, add, sub } from '../core';
import type { Point } from '../geometry';
import { type Rect, type View, gammaPerPixel, panView, screenToGamma } from '../chart/viewport';
import { clampToDisc, snapToLandmark } from '../workspace';

export const DRAG_THRESHOLD_PX = 4;
export const SNAP_RADIUS_PX = 8;

export const PRIMARY_BUTTON = 0;
export const MIDDLE_BUTTON = 1;

export type Gesture =
  | { readonly kind: 'idle' }
  | { readonly kind: 'press-background'; readonly pointerId: number; readonly start: Point; readonly startView: View }
  | { readonly kind: 'pan'; readonly pointerId: number; readonly start: Point; readonly startView: View }
  | {
      readonly kind: 'press-point' | 'drag-point';
      readonly pointerId: number;
      readonly start: Point;
      readonly pointId: string;
      /** Γ(point) − Γ(pointer) at press time. */
      readonly grabOffset: Complex;
    };

export type Command =
  | { readonly type: 'create'; readonly gamma: Complex }
  | { readonly type: 'select'; readonly id: string }
  | { readonly type: 'deselect' }
  | { readonly type: 'move'; readonly id: string; readonly gamma: Complex }
  | { readonly type: 'view'; readonly view: View };

export interface GestureContext {
  readonly rect: Rect;
  readonly view: View;
  /** Snap to matched/short/open landmarks. */
  readonly snap: boolean;
}

export interface PointerInput {
  readonly pointerId: number;
  readonly client: Point;
  readonly button: number;
}

/** What the pointer went down on: a plotted point, or the chart background. */
export type PressTarget = { readonly pointId: string; readonly pointGamma: Complex } | null;

export interface Transition {
  readonly gesture: Gesture;
  readonly commands: readonly Command[];
}

export const IDLE: Gesture = Object.freeze({ kind: 'idle' });

const NOTHING: readonly Command[] = [];

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Γ under the pointer, constrained to the disc and optionally snapped. */
export function constrainedGamma(gamma: Complex, ctx: GestureContext): Complex {
  const clamped = clampToDisc(gamma);
  if (!ctx.snap) return clamped;
  return snapToLandmark(clamped, SNAP_RADIUS_PX * gammaPerPixel(ctx.rect, ctx.view));
}

export function pointerDown(gesture: Gesture, input: PointerInput, target: PressTarget, ctx: GestureContext): Transition {
  if (gesture.kind !== 'idle') return { gesture, commands: NOTHING };
  const { pointerId, client } = input;

  if (input.button === MIDDLE_BUTTON) {
    return { gesture: { kind: 'pan', pointerId, start: client, startView: ctx.view }, commands: NOTHING };
  }
  if (input.button !== PRIMARY_BUTTON) return { gesture, commands: NOTHING };

  if (target) {
    const grabOffset = sub(target.pointGamma, screenToGamma(client, ctx.rect, ctx.view));
    return {
      gesture: { kind: 'press-point', pointerId, start: client, pointId: target.pointId, grabOffset },
      commands: [{ type: 'select', id: target.pointId }],
    };
  }
  return { gesture: { kind: 'press-background', pointerId, start: client, startView: ctx.view }, commands: NOTHING };
}

export function pointerMove(gesture: Gesture, input: Pick<PointerInput, 'pointerId' | 'client'>, ctx: GestureContext): Transition {
  if (gesture.kind === 'idle' || gesture.pointerId !== input.pointerId) return { gesture, commands: NOTHING };

  switch (gesture.kind) {
    case 'press-background': {
      if (distance(gesture.start, input.client) <= DRAG_THRESHOLD_PX) return { gesture, commands: NOTHING };
      const pan: Gesture = { ...gesture, kind: 'pan' };
      return pointerMove(pan, input, ctx);
    }
    case 'pan':
      return {
        gesture,
        commands: [{ type: 'view', view: panView(gesture.startView, ctx.rect, gesture.start, input.client) }],
      };
    case 'press-point': {
      if (distance(gesture.start, input.client) <= DRAG_THRESHOLD_PX) return { gesture, commands: NOTHING };
      return pointerMove({ ...gesture, kind: 'drag-point' }, input, ctx);
    }
    case 'drag-point': {
      const raw = add(screenToGamma(input.client, ctx.rect, ctx.view), gesture.grabOffset);
      return { gesture, commands: [{ type: 'move', id: gesture.pointId, gamma: constrainedGamma(raw, ctx) }] };
    }
  }
}

export function pointerUp(gesture: Gesture, input: Pick<PointerInput, 'pointerId' | 'client'>, ctx: GestureContext): Transition {
  if (gesture.kind === 'idle' || gesture.pointerId !== input.pointerId) return { gesture, commands: NOTHING };

  if (gesture.kind === 'press-background') {
    const gamma = screenToGamma(input.client, ctx.rect, ctx.view);
    if (abs(gamma) > 1) return { gesture: IDLE, commands: [{ type: 'deselect' }] };
    return { gesture: IDLE, commands: [{ type: 'create', gamma: constrainedGamma(gamma, ctx) }] };
  }
  return { gesture: IDLE, commands: NOTHING };
}

/** Pointer cancelled by the browser (e.g. touch interrupted): abandon without side effects. */
export function pointerCancel(gesture: Gesture, pointerId: number): Transition {
  if (gesture.kind === 'idle' || gesture.pointerId !== pointerId) return { gesture, commands: NOTHING };
  return { gesture: IDLE, commands: NOTHING };
}

/** Wheel delta → multiplicative zoom factor. Pinch gestures arrive as ctrl+wheel with small deltas. */
export function wheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const sensitivity = ctrlKey ? 0.01 : 0.002;
  const clamped = Math.max(-200, Math.min(200, pixels));
  return Math.exp(-clamped * sensitivity);
}
