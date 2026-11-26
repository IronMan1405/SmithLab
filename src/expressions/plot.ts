/**
 * Where (and whether) a typed value appears on the Smith Chart.
 * Every chart type is converted to its reflection coefficient Γ, the chart's
 * own coordinate.
 */
import { type Complex, abs, isNaNComplex } from '../core';
import { BOUNDARY_TOLERANCE } from '../core/reflection';
import { type FunctionContext, toReflection } from './functions';
import { TYPE_INFO, type TypedValue } from './types';

export type PlotResult =
  | { readonly kind: 'point'; readonly gamma: Complex }
  | { readonly kind: 'none'; readonly reason: string | null };

export function plotValue(value: TypedValue, ctx: FunctionContext): PlotResult {
  if (!TYPE_INFO[value.type].plottable) {
    return {
      kind: 'none',
      reason:
        value.type === 'complex'
          ? 'A plain complex number has no position on the chart. Wrap it in z(…), y() or gamma(…) to plot it.'
          : null,
    };
  }
  const gamma = toReflection(value, ctx, 'plot');
  if (isNaNComplex(gamma) || !Number.isFinite(abs(gamma))) {
    return { kind: 'none', reason: 'No position on the chart (Γ is undefined or infinite).' };
  }
  const magnitude = abs(gamma);
  if (magnitude > 1 + BOUNDARY_TOLERANCE) {
    return { kind: 'none', reason: `Outside the chart: |Γ| = ${magnitude.toPrecision(4)} > 1 (active load).` };
  }
  return { kind: 'point', gamma };
}
