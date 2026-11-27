/**
 * Direct manipulation of expression-defined points.
 *
 * A point expression is draggable only when it evaluates to a chart quantity
 * (z, y, Γ or Z) *and* its text is a literal (see `draggableLiteral`). A
 * drag converts the new Γ back into the expression's own type and rewrites
 * just that literal; upstream or dependent expressions are never modified
 * (dependents update through normal re-evaluation).
 */
import type { Complex } from '../core';
import { type ChartMode, canonicalFromDisplay } from '../geometry/chart-mode';
import type { ExpressionDef } from './definitions';
import { draggableLiteral, withDraggedValue } from './definitions';
import type { ExpressionResult } from './engine';
import { valueFromCanonical } from './plot';
import { TYPE_INFO } from './types';

export function isDraggableExpression(def: ExpressionDef, result: ExpressionResult | undefined): boolean {
  return (
    result?.status === 'ok' &&
    result.value !== null &&
    TYPE_INFO[result.value.type].plottable &&
    draggableLiteral(def.text) !== null
  );
}

/**
 * New text for `def` after its point is dragged to the *displayed* position
 * `display` in chart mode `mode`; null if not draggable or not representable.
 * The displayed position is mapped back to canonical coordinates and then to
 * a value of the expression's own type, so the point stays under the pointer.
 */
export function rewriteForDrag(
  def: ExpressionDef,
  result: ExpressionResult | undefined,
  display: Complex,
  z0: number,
  mode: ChartMode = 'impedance',
): string | null {
  if (!isDraggableExpression(def, result) || !result?.value || result.plot?.kind !== 'point') return null;
  const canonical = canonicalFromDisplay(display, result.plot.frame, mode);
  const value = valueFromCanonical(canonical, result.value.type, z0);
  if (!value) return null;
  return withDraggedValue(def.text, value, result.value.type === 'physicalImpedance');
}
