/**
 * Keyboard commands (pure). Maps a key press to a workspace/view command.
 *
 *   Delete / Backspace   delete the selected point
 *   Escape               clear selection
 *   Arrow keys           nudge the selected point (Shift: ×10); on a line's
 *                        input point, →/↑ lengthen the line toward the
 *                        generator and ←/↓ shorten it
 *   + / =                zoom in about the view centre
 *   −                    zoom out
 *   0                    fit / reset view
 */
import { type Complex, add, complex } from '../core';
import { type View, DEFAULT_VIEW, zoomAbout } from '../chart/viewport';
import { type ResolvedPoint, clampToDisc } from '../workspace';
import type { Command } from './gestures';

export type KeyCommand =
  | Command
  | { readonly type: 'delete'; readonly id: string }
  | { readonly type: 'line-length'; readonly id: string; readonly length: number };

export interface KeyInput {
  readonly key: string;
  readonly shiftKey: boolean;
}

export interface KeyContext {
  readonly selected: ResolvedPoint | null;
  readonly view: View;
  /** A selected non-point object (e.g. a radial guide) that Delete removes. */
  readonly deletableId?: string | null;
}

/** Nudge step in Γ units at zoom 1; scaled by 1/zoom so it is constant on screen. */
export const NUDGE_STEP = 0.005;
export const KEY_ZOOM_FACTOR = 1.25;
/** Line-length step for arrow keys, in wavelengths (Shift: ×10). */
export const LENGTH_STEP = 0.001;

const ARROWS: Record<string, Complex> = {
  ArrowUp: complex(0, 1),
  ArrowDown: complex(0, -1),
  ArrowLeft: complex(-1, 0),
  ArrowRight: complex(1, 0),
};

export function commandForKey(input: KeyInput, ctx: KeyContext): KeyCommand | null {
  const { key } = input;
  const { selected, view } = ctx;

  const arrow = ARROWS[key];
  // Expression points can only be moved when their expression is a literal
  // (the move rewrites it); computed ones are edited in the panel.
  const movable = selected && (selected.role !== 'expression' || selected.draggable) ? selected : null;
  const editable = selected && selected.role !== 'expression' ? selected : null;
  if (arrow) {
    if (!movable) return null;
    if (movable.transform?.type === 'line') {
      const sign = key === 'ArrowRight' || key === 'ArrowUp' ? 1 : -1;
      const length = movable.transform.length + sign * LENGTH_STEP * (input.shiftKey ? 10 : 1);
      // Round to the step grid so repeated presses don't accumulate float noise.
      return { type: 'line-length', id: movable.id, length: Math.round(length / LENGTH_STEP) / (1 / LENGTH_STEP) };
    }
    const step = (NUDGE_STEP * (input.shiftKey ? 10 : 1)) / view.zoom;
    const gamma = clampToDisc(add(movable.gamma, complex(arrow.re * step, arrow.im * step)));
    return { type: 'move', id: movable.id, gamma };
  }

  switch (key) {
    case 'Delete':
    case 'Backspace':
      if (editable) return { type: 'delete', id: editable.id };
      return ctx.deletableId ? { type: 'delete', id: ctx.deletableId } : null;
    case 'Escape':
      return selected ? { type: 'deselect' } : null;
    case '+':
    case '=':
      return { type: 'view', view: zoomAbout(view, view.center, KEY_ZOOM_FACTOR) };
    case '-':
    case '_':
      return { type: 'view', view: zoomAbout(view, view.center, 1 / KEY_ZOOM_FACTOR) };
    case '0':
      return { type: 'view', view: DEFAULT_VIEW };
    default:
      return null;
  }
}

/** True when key events should be left to a focused text field. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}
