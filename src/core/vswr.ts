/**
 * VSWR and return loss.
 *
 *   VSWR = (1 + |Γ|) / (1 − |Γ|)
 *   RL   = −20 log₁₀ |Γ|   (dB)
 *
 * Conventions
 * -----------
 * - VSWR is only defined for passive loads, |Γ| ≤ 1. For |Γ| = 1 (open,
 *   short, pure reactance) it is +∞. For |Γ| > 1 the formula yields a
 *   negative number with no physical meaning, so a RangeError is thrown.
 *   |Γ| within BOUNDARY_TOLERANCE above 1 is treated as exactly 1.
 * - Return loss is defined for any |Γ|: +∞ dB for a perfect match (Γ = 0),
 *   0 dB for total reflection, and negative for |Γ| > 1 (reflection gain from
 *   an active load). It is reported, not hidden.
 */
import { type Complex, abs, assertComplex } from './complex';
import { BOUNDARY_TOLERANCE } from './reflection';

function assertMagnitude(magnitude: number): void {
  if (typeof magnitude !== 'number' || Number.isNaN(magnitude) || magnitude < 0) {
    throw new RangeError(`|Γ| must be a non-negative number (got ${String(magnitude)})`);
  }
}

export function vswrFromReflectionMagnitude(magnitude: number): number {
  assertMagnitude(magnitude);
  if (magnitude > 1 + BOUNDARY_TOLERANCE) {
    throw new RangeError(`VSWR is undefined for |Γ| > 1 (active load, |Γ| = ${magnitude})`);
  }
  if (magnitude >= 1) return Infinity;
  return (1 + magnitude) / (1 - magnitude);
}

export function vswrFromReflection(gamma: Complex): number {
  assertComplex(gamma, 'reflection coefficient');
  return vswrFromReflectionMagnitude(abs(gamma));
}

/** |Γ| = (VSWR − 1)/(VSWR + 1). VSWR must be ≥ 1; VSWR = ∞ gives 1. */
export function reflectionMagnitudeFromVswr(vswr: number): number {
  if (typeof vswr !== 'number' || Number.isNaN(vswr) || vswr < 1) {
    throw new RangeError(`VSWR must be ≥ 1 (got ${String(vswr)})`);
  }
  if (vswr === Infinity) return 1;
  return (vswr - 1) / (vswr + 1);
}

export function returnLossFromReflectionMagnitude(magnitude: number): number {
  assertMagnitude(magnitude);
  if (magnitude === 0) return Infinity;
  if (magnitude === Infinity) return -Infinity;
  return -20 * Math.log10(magnitude);
}

/** Return loss in dB for a complex reflection coefficient. */
export function returnLossDb(gamma: Complex): number {
  assertComplex(gamma, 'reflection coefficient');
  return returnLossFromReflectionMagnitude(abs(gamma));
}
