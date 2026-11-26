/**
 * DOM adapter for the gesture state machine: translates pointer and wheel
 * events on the chart's <svg> into commands. All decisions are made by the
 * pure functions in `gestures.ts`; this hook only gathers inputs (bounding
 * rectangle, hit-tested point, modifier keys) and manages pointer capture.
 */
import { type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { type Complex, abs } from '../core';
import { type View, screenToGamma, zoomAbout } from '../chart/viewport';
import type { WorkspacePoint } from '../workspace';
import {
  type Command,
  type Gesture,
  type GestureContext,
  type PressTarget,
  type Transition,
  IDLE,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  wheelZoomFactor,
} from './gestures';

/** Attribute that marks the hit area of a plotted point. */
export const POINT_ID_ATTRIBUTE = 'data-point-id';
/** Attribute that marks the hit area of a curve. Points take priority over curves. */
export const CURVE_ID_ATTRIBUTE = 'data-curve-id';

interface Options {
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly view: View;
  readonly points: readonly WorkspacePoint[];
  readonly onCommand: (command: Command) => void;
}

export interface ChartInteraction {
  readonly handlers: {
    readonly onPointerDown: (e: PointerEvent<SVGSVGElement>) => void;
    readonly onPointerMove: (e: PointerEvent<SVGSVGElement>) => void;
    readonly onPointerUp: (e: PointerEvent<SVGSVGElement>) => void;
    readonly onPointerCancel: (e: PointerEvent<SVGSVGElement>) => void;
    readonly onPointerLeave: () => void;
  };
  /** Γ under the pointer while idle and inside the disc; otherwise null. */
  readonly hover: Complex | null;
  readonly gestureKind: Gesture['kind'];
}

function hitTest(target: EventTarget | null, points: readonly WorkspacePoint[]): PressTarget {
  if (!(target instanceof Element)) return null;
  const id = target.closest(`[${POINT_ID_ATTRIBUTE}]`)?.getAttribute(POINT_ID_ATTRIBUTE);
  const point = id ? points.find((p) => p.id === id) : undefined;
  if (point) return { pointId: point.id, pointGamma: point.gamma };
  const curveId = target.closest(`[${CURVE_ID_ATTRIBUTE}]`)?.getAttribute(CURVE_ID_ATTRIBUTE);
  return curveId ? { curveId } : null;
}

export function useChartInteraction({ svgRef, view, points, onCommand }: Options): ChartInteraction {
  const gestureRef = useRef<Gesture>(IDLE);
  const [gestureKind, setGestureKind] = useState<Gesture['kind']>('idle');
  const [hover, setHover] = useState<Complex | null>(null);

  // Latest values for event handlers without re-binding them every render.
  const latest = useRef({ view, points, onCommand });
  latest.current = { view, points, onCommand };

  const context = useCallback(
    (altKey: boolean): GestureContext | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return { rect, view: latest.current.view, snap: !altKey };
    },
    [svgRef],
  );

  const commit = useCallback((transition: Transition) => {
    gestureRef.current = transition.gesture;
    setGestureKind(transition.gesture.kind);
    for (const command of transition.commands) latest.current.onCommand(command);
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const ctx = context(e.altKey);
      if (!ctx) return;
      const transition = pointerDown(
        gestureRef.current,
        { pointerId: e.pointerId, client: { x: e.clientX, y: e.clientY }, button: e.button },
        hitTest(e.target, latest.current.points),
        ctx,
      );
      if (transition.gesture.kind !== 'idle' && gestureRef.current.kind === 'idle') {
        e.currentTarget.setPointerCapture(e.pointerId);
        if (e.button === 1) e.preventDefault(); // suppress middle-click autoscroll
        setHover(null);
      }
      commit(transition);
    },
    [commit, context],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const ctx = context(e.altKey);
      if (!ctx) return;
      const client = { x: e.clientX, y: e.clientY };
      if (gestureRef.current.kind === 'idle') {
        const gamma = screenToGamma(client, ctx.rect, ctx.view);
        setHover(abs(gamma) <= 1 ? gamma : null);
        return;
      }
      commit(pointerMove(gestureRef.current, { pointerId: e.pointerId, client }, ctx));
    },
    [commit, context],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const ctx = context(e.altKey);
      if (!ctx) return;
      commit(pointerUp(gestureRef.current, { pointerId: e.pointerId, client: { x: e.clientX, y: e.clientY } }, ctx));
    },
    [commit, context],
  );

  const onPointerCancel = useCallback(
    (e: PointerEvent<SVGSVGElement>) => commit(pointerCancel(gestureRef.current, e.pointerId)),
    [commit],
  );

  const onPointerLeave = useCallback(() => setHover(null), []);

  // Wheel zoom needs a non-passive native listener so the page doesn't scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const current = latest.current.view;
      const anchor = screenToGamma({ x: e.clientX, y: e.clientY }, rect, current);
      const view = zoomAbout(current, anchor, wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey));
      latest.current.onCommand({ type: 'view', view });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgRef]);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave },
    hover,
    gestureKind,
  };
}
