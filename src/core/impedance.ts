/**
 * Impedance normalisation.
 *
 *   z = Z / Z₀        (normalised impedance, dimensionless)
 *   Z = z · Z₀        (physical impedance, ohms)
 *
 * Convention: the reference impedance Z₀ is a finite, strictly positive real
 * number of ohms (the usual lossless-line case). Complex reference impedances
 * are deliberately rejected rather than silently mishandled; they require a
 * different definition of the reflection coefficient (power waves) and are
 * out of scope for Milestone 1.
 *
 * Open circuits are represented by complex infinity and pass through
 * normalisation unchanged.
 */
import { type Complex, assertComplex, scale } from './complex';

/** Default system reference impedance in ohms. */
export const DEFAULT_Z0 = 50;

export function assertReferenceImpedance(z0: number): void {
  if (typeof z0 !== 'number' || !Number.isFinite(z0) || z0 <= 0) {
    throw new RangeError(`Reference impedance Z₀ must be a finite positive number of ohms (got ${String(z0)})`);
  }
}

/** Physical impedance Z (Ω) → normalised impedance z. */
export function normalizeImpedance(impedance: Complex, z0: number = DEFAULT_Z0): Complex {
  assertComplex(impedance, 'impedance');
  assertReferenceImpedance(z0);
  return scale(impedance, 1 / z0);
}

/** Normalised impedance z → physical impedance Z (Ω). */
export function denormalizeImpedance(z: Complex, z0: number = DEFAULT_Z0): Complex {
  assertComplex(z, 'normalized impedance');
  assertReferenceImpedance(z0);
  return scale(z, z0);
}
