/**
 * Keyboard commands (pure). Maps a key press to a workspace/view command.
 *
 *   Delete / Backspace   delete the selected point
 *   Escape               clear selection
 *   Arrow keys           nudge the selected point (Shift: ×10)
 *   + / =                zoom in about the view centre
 *   −                    zoom out
 *   0                    fit / reset view
 */
import { type Complex, add, complex } from '../core';
import { type View, DEFAULT_VIEW, zoomAbout } from '../chart/viewport';
import { type WorkspacePoint, clampToDisc } from '../workspace';
import type { Command } from './gestures';

export type KeyCommand = Command | { readonly type: 'delete'; readonly id: string };

export interface KeyInput {
  readonly key: string;
  readonly shiftKey: boolean;
}

export interface KeyContext {
  readonly selected: WorkspacePoint | null;
  readonly view: View;
}

/** Nudge step in Γ units at zoom 1; scaled by 1/zoom so it is constant on screen. */
export const NUDGE_STEP = 0.005;
export const KEY_ZOOM_FACTOR = 1.25;

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
  if (arrow) {
    if (!selected) return null;
    const step = (NUDGE_STEP * (input.shiftKey ? 10 : 1)) / view.zoom;
    const gamma = clampToDisc(add(selected.gamma, complex(arrow.re * step, arrow.im * step)));
    return { type: 'move', id: selected.id, gamma };
  }

  switch (key) {
    case 'Delete':
    case 'Backspace':
      return selected ? { type: 'delete', id: selected.id } : null;
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
