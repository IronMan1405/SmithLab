/**
 * Constraints that keep plotted points on the passive Smith Chart and make
 * its landmarks (match, short, open) reachable by direct manipulation.
 */
import { type Complex, ONE, ZERO, abs, assertComplex, complex, scale, sub } from '../core';

/**
 * Project Γ onto the closed unit disc |Γ| ≤ 1 (radial projection).
 * Points already inside are returned unchanged.
 */
export function clampToDisc(gamma: Complex): Complex {
  assertComplex(gamma, 'reflection coefficient');
  const magnitude = abs(gamma);
  if (magnitude <= 1) return gamma;
  if (!Number.isFinite(magnitude)) throw new RangeError('Cannot clamp an infinite reflection coefficient');
  const projected = scale(gamma, 1 / magnitude);
  // Guard against rounding leaving |Γ| a hair above 1.
  return abs(projected) > 1 ? complex(projected.re / abs(projected), projected.im / abs(projected)) : projected;
}

export interface SnapTarget {
  readonly gamma: Complex;
  readonly label: string;
}

/** Matched load, short circuit and open circuit. */
export const SNAP_TARGETS: readonly SnapTarget[] = [
  { gamma: ZERO, label: 'matched' },
  { gamma: complex(-1, 0), label: 'short' },
  { gamma: ONE, label: 'open' },
];

/**
 * Snap Γ to the nearest landmark within `tolerance` (Γ-plane units), so the
 * exact matched/short/open conditions can be placed by hand.
 */
export function snapToLandmark(gamma: Complex, tolerance: number, targets: readonly SnapTarget[] = SNAP_TARGETS): Complex {
  let best: Complex | null = null;
  let bestDistance = tolerance;
  for (const target of targets) {
    const distance = abs(sub(gamma, target.gamma));
    if (distance <= bestDistance) {
      best = target.gamma;
      bestDistance = distance;
    }
  }
  return best ?? gamma;
}

export function isInsideDisc(gamma: Complex): boolean {
  return abs(gamma) <= 1;
}
