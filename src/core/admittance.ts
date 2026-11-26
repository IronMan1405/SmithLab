/**
 * Admittance.
 *
 *   y = 1 / z         (normalised admittance)
 *   y = Y · Z₀        (normalisation of a physical admittance Y in siemens)
 *   Γ = (1 − y) / (1 + y) = −Γ_z(y)
 *
 * The reciprocal follows the Riemann-sphere convention of `complex.ts`:
 * a short (z = 0) has y = ∞, an open (z = ∞) has y = 0.
 */
import { type Complex, assertComplex, neg, reciprocal, scale } from './complex';
import { assertReferenceImpedance, DEFAULT_Z0 } from './impedance';
import { impedanceFromReflection, reflectionFromImpedance } from './reflection';

export function admittanceFromImpedance(z: Complex): Complex {
  assertComplex(z, 'normalized impedance');
  return reciprocal(z);
}

export function impedanceFromAdmittance(y: Complex): Complex {
  assertComplex(y, 'normalized admittance');
  return reciprocal(y);
}

/** Physical admittance Y (S) → normalised admittance y = Y·Z₀. */
export function normalizeAdmittance(admittance: Complex, z0: number = DEFAULT_Z0): Complex {
  assertComplex(admittance, 'admittance');
  assertReferenceImpedance(z0);
  return scale(admittance, z0);
}

/** Normalised admittance y → physical admittance Y = y/Z₀ (S). */
export function denormalizeAdmittance(y: Complex, z0: number = DEFAULT_Z0): Complex {
  assertComplex(y, 'normalized admittance');
  assertReferenceImpedance(z0);
  return scale(y, 1 / z0);
}

/**
 * Γ from normalised admittance. Uses Γ_y(y) = −Γ_z(y): the admittance chart
 * is the impedance chart rotated by 180°.
 */
export function reflectionFromAdmittance(y: Complex): Complex {
  assertComplex(y, 'normalized admittance');
  return neg(reflectionFromImpedance(y));
}

/** Normalised admittance from Γ: y = (1 − Γ)/(1 + Γ). */
export function admittanceFromReflection(gamma: Complex): Complex {
  assertComplex(gamma, 'reflection coefficient');
  return impedanceFromReflection(neg(gamma));
}
