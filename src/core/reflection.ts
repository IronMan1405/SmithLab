/**
 * Reflection coefficient ↔ normalised impedance.
 *
 *   Γ = (z − 1) / (z + 1)
 *   z = (1 + Γ) / (1 − Γ)
 *
 * Both maps are Möbius transforms on the extended complex plane, and are
 * exact inverses of each other there:
 *
 *   z = 0   (short)    ↔  Γ = −1
 *   z = 1   (matched)  ↔  Γ = 0
 *   z = ∞   (open)     ↔  Γ = +1
 *   z = −1  (pole)     ↔  Γ = ∞
 *
 * The passive region Re(z) ≥ 0 maps onto the closed unit disc |Γ| ≤ 1.
 * Values with Re(z) < 0 (active loads) map outside the disc; they are
 * returned faithfully rather than clamped, and `isPassiveReflection()` can
 * be used to test for them.
 */
import {
  type Complex,
  ONE,
  abs,
  add,
  assertComplex,
  complex,
  div,
  isInfinite,
  sub,
} from './complex';

/**
 * Tolerance applied when deciding whether |Γ| lies on the unit circle.
 * Pure reactances evaluate to |Γ| = 1 ± a few ULPs; this absorbs that noise.
 */
export const BOUNDARY_TOLERANCE = 1e-12;

const MINUS_ONE = complex(-1, 0);

export function reflectionFromImpedance(z: Complex): Complex {
  assertComplex(z, 'normalized impedance');
  // (∞ − 1)/(∞ + 1) is ∞/∞ in naive arithmetic; the limit is exactly 1.
  if (isInfinite(z)) return ONE;
  // z = −1 is the pole of the map; div() returns ∞ here, which is correct.
  return div(sub(z, ONE), add(z, ONE));
}

export function impedanceFromReflection(gamma: Complex): Complex {
  assertComplex(gamma, 'reflection coefficient');
  // Limit of (1 + Γ)/(1 − Γ) as Γ → ∞ is −1.
  if (isInfinite(gamma)) return MINUS_ONE;
  // Γ = 1 gives 2/0 = ∞ (open circuit) via div().
  return div(add(ONE, gamma), sub(ONE, gamma));
}

/** True when |Γ| ≤ 1 (within BOUNDARY_TOLERANCE): a passive load. */
export function isPassiveReflection(gamma: Complex): boolean {
  assertComplex(gamma, 'reflection coefficient');
  return abs(gamma) <= 1 + BOUNDARY_TOLERANCE;
}

/** True when |Γ| = 1 within tolerance: a lossless (purely reactive) load. */
export function isOnBoundary(gamma: Complex): boolean {
  assertComplex(gamma, 'reflection coefficient');
  return Math.abs(abs(gamma) - 1) <= BOUNDARY_TOLERANCE;
}

