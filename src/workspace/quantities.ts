/**
 * Electrical quantities of a plotted point, derived from Γ and Z₀ using the
 * core engine only.
 *
 * Special cases
 * -------------
 * - Matched load (Γ = 0): VSWR = 1, return loss = +∞ dB, phase undefined (NaN).
 * - Short circuit (Γ = −1): z = 0, y = ∞.
 * - Open circuit (Γ = +1): z = ∞, y = 0.
 * - Lossless boundary (|Γ| = 1 within tolerance): r and g are exactly 0,
 *   VSWR = ∞ and return loss = 0 dB. On the unit circle r = (1 − |Γ|²)/|1 − Γ|²
 *   vanishes analytically; this removes ±1e-16 round-off that would otherwise
 *   display as a meaningless tiny (or negative) resistance.
 */
import {
  type Complex,
  ONE,
  abs,
  admittanceFromReflection,
  approxEqual,
  arg,
  complex,
  denormalizeImpedance,
  impedanceFromReflection,
  isFiniteComplex,
  isOnBoundary,
  isZero,
  returnLossDb,
  vswrFromReflection,
} from '../core';

export type LoadKind = 'matched' | 'short' | 'open' | 'lossless' | 'general';

export interface PointQuantities {
  readonly kind: LoadKind;
  readonly gamma: Complex;
  readonly gammaMagnitude: number;
  /** Phase of Γ in degrees, (−180, 180]; NaN when Γ = 0. */
  readonly gammaPhaseDeg: number;
  /** Normalised impedance z = r + jx. */
  readonly z: Complex;
  /** Physical impedance Z = R + jX in ohms. */
  readonly impedance: Complex;
  /** Normalised admittance y = g + jb. */
  readonly y: Complex;
  readonly vswr: number;
  readonly returnLossDb: number;
}

const LANDMARK_TOLERANCE = 1e-12;

export function classifyLoad(gamma: Complex): LoadKind {
  if (isZero(gamma)) return 'matched';
  if (approxEqual(gamma, complex(-1, 0), LANDMARK_TOLERANCE)) return 'short';
  if (approxEqual(gamma, ONE, LANDMARK_TOLERANCE)) return 'open';
  if (isOnBoundary(gamma)) return 'lossless';
  return 'general';
}

function losslessPart(c: Complex): Complex {
  return isFiniteComplex(c) ? complex(0, c.im) : c;
}

export function pointQuantities(gamma: Complex, z0: number): PointQuantities {
  const kind = classifyLoad(gamma);
  const onBoundary = kind === 'short' || kind === 'open' || kind === 'lossless';

  let z = impedanceFromReflection(gamma);
  let y = admittanceFromReflection(gamma);
  if (kind === 'short') {
    z = complex(0, 0);
  } else if (kind === 'open') {
    y = complex(0, 0);
  } else if (onBoundary) {
    z = losslessPart(z);
    y = losslessPart(y);
  }

  return {
    kind,
    gamma,
    gammaMagnitude: onBoundary ? 1 : abs(gamma),
    gammaPhaseDeg: kind === 'matched' ? NaN : (arg(gamma) * 180) / Math.PI,
    z,
    impedance: denormalizeImpedance(z, z0),
    y,
    vswr: vswrFromReflection(gamma),
    returnLossDb: onBoundary ? 0 : returnLossDb(gamma),
  };
}
