/**
 * Where (and whether) a typed value appears on the Smith Chart.
 * Every chart type is converted to its reflection coefficient Γ, the chart's
 * own coordinate.
 */
import { type Complex, abs, admittanceFromReflection, impedanceFromReflection, isNaNComplex, scale } from '../core';
import { BOUNDARY_TOLERANCE } from '../core/reflection';
import { type FunctionContext, canonicalPosition, toReflection } from './functions';
import { TYPE_INFO, type TypedValue, type ValueType } from './types';

export type PlotResult =
  | {
      readonly kind: 'point';
      /** Physical Γ of the load the value represents (for readouts). */
      readonly gamma: Complex;
      /** Canonical chart coordinates (see geometry/chart-mode.ts). */
      readonly position: Complex;
      readonly frame: 'number' | 'plane';
    }
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
  const { position, frame } = canonicalPosition(value, ctx, 'plot');
  return { kind: 'point', gamma, position, frame };
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

/**
 * Inverse of canonical placement: the value of the given type whose canonical
 * position is `position`. z/y/Z values are numbers w = C_Z⁻¹(κ) (×Z₀ for Z);
 * Γ values are the position itself. Null when the value would be infinite.
 */
export function valueFromCanonical(position: Complex, type: ValueType, z0: number): Complex | null {
  let value: Complex;
  switch (type) {
    case 'reflection':
      value = position;
      break;
    case 'impedance':
    case 'admittance':
      value = impedanceFromReflection(position);
      break;
    case 'physicalImpedance':
      value = scale(impedanceFromReflection(position), z0);
      break;
    default:
      return null;
  }
  return Number.isFinite(value.re) && Number.isFinite(value.im) ? value : null;
}
