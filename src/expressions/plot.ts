/**
 * Where (and whether) a typed value appears on the Smith Chart.
 * Every chart type is converted to its reflection coefficient Γ, the chart's
 * own coordinate.
 */
import { type Complex, abs, admittanceFromReflection, impedanceFromReflection, isNaNComplex, scale } from '../core';
import { BOUNDARY_TOLERANCE } from '../core/reflection';
import { type FunctionContext, toReflection } from './functions';
import { TYPE_INFO, type TypedValue, type ValueType } from './types';

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

/**
 * Inverse of plotting: the value of the given chart type located at Γ.
 * Used when an expression point is dragged. Null when the type has no chart
 * position or the value would be infinite (e.g. an impedance at Γ = 1).
 */
export function valueFromReflection(gamma: Complex, type: ValueType, z0: number): Complex | null {
  let value: Complex;
  switch (type) {
    case 'reflection':
      value = gamma;
      break;
    case 'impedance':
      value = impedanceFromReflection(gamma);
      break;
    case 'admittance':
      value = admittanceFromReflection(gamma);
      break;
    case 'physicalImpedance':
      value = scale(impedanceFromReflection(gamma), z0);
      break;
    default:
      return null;
  }
  return Number.isFinite(value.re) && Number.isFinite(value.im) ? value : null;
}
