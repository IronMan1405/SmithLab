/**
 * Lossless transmission-line transformations.
 *
 *   Γ_in = Γ_L · e^(−j2βl) = Γ_L · e^(−j4πd),   β = 2π/λ,  d = l/λ
 *
 * Conventions
 * -----------
 * - `d` is the normalised electrical length in wavelengths, measured from
 *   the load **toward the generator**. Positive d rotates Γ clockwise in
 *   the Γ-plane (negative mathematical angle); negative d rotates
 *   counter-clockwise (toward the load), which is the reverse transformation.
 * - The line's characteristic impedance equals the reference impedance used
 *   to normalise z (the workspace Z₀). Lines with a different characteristic
 *   impedance need a reference-impedance change and are not modelled here.
 * - The transformation is periodic in d with period 1/2 wavelength.
 * - The rotation phasor is evaluated exactly when 2d is a multiple of 1/4
 *   (d = 0, λ/8, λ/4, 3λ/8, …), so the textbook cases carry no round-off.
 */
import { type Complex, ONE, abs, arg, assertComplex, complex, isZero, mul } from './complex';
import { impedanceFromReflection, reflectionFromImpedance } from './reflection';

/** Speed of light in vacuum, m/s (exact by definition of the metre). */
export const SPEED_OF_LIGHT = 299_792_458;

/** Period of the input-impedance transformation, in wavelengths. */
export const LINE_PERIOD = 0.5;

function assertLength(d: number, name = 'electrical length'): void {
  if (typeof d !== 'number' || !Number.isFinite(d)) {
    throw new RangeError(`${name} must be a finite number of wavelengths (got ${String(d)})`);
  }
}

/**
 * Unit phasor e^(−j4πd). Computed in turns (−2d) and reduced to [0, 1) so
 * large |d| does not lose accuracy, with exact values at quarter turns.
 */
export function linePhasor(d: number): Complex {
  assertLength(d);
  const turns = -2 * d;
  const reduced = turns - Math.floor(turns); // [0, 1)
  const quarters = reduced * 4;
  if (Number.isInteger(quarters)) {
    return [ONE, complex(0, 1), complex(-1, 0), complex(0, -1)][quarters] ?? ONE;
  }
  const angle = 2 * Math.PI * reduced;
  return complex(Math.cos(angle), Math.sin(angle));
}

/** Γ at the input of a lossless line of electrical length d (wavelengths) terminated in Γ_L. */
export function reflectionThroughLine(gammaLoad: Complex, d: number): Complex {
  assertComplex(gammaLoad, 'load reflection coefficient');
  const phasor = linePhasor(d); // validates d
  // A matched load is unaffected; return an exact (unsigned) zero.
  if (isZero(gammaLoad)) return complex(0, 0);
  return mul(gammaLoad, phasor);
}

/** Reverse transformation: the load Γ that produces `gammaInput` at the input of a line of length d. */
export function loadReflectionFromInput(gammaInput: Complex, d: number): Complex {
  assertLength(d);
  return reflectionThroughLine(gammaInput, -d);
}

/** Normalised input impedance of a lossless line of length d terminated in normalised z_L. */
export function impedanceThroughLine(zLoad: Complex, d: number): Complex {
  return impedanceFromReflection(reflectionThroughLine(reflectionFromImpedance(zLoad), d));
}

/** Reverse transformation for normalised impedance. */
export function loadImpedanceFromInput(zInput: Complex, d: number): Complex {
  assertLength(d);
  return impedanceThroughLine(zInput, -d);
}

/** d = l / λ. Both lengths in the same unit; λ must be positive. */
export function electricalLength(physicalLength: number, wavelength: number): number {
  assertLength(physicalLength, 'physical length');
  if (!Number.isFinite(wavelength) || wavelength <= 0) {
    throw new RangeError(`Wavelength must be a finite positive number (got ${String(wavelength)})`);
  }
  return physicalLength / wavelength;
}

/** l = d · λ. */
export function physicalLength(d: number, wavelength: number): number {
  assertLength(d);
  if (!Number.isFinite(wavelength) || wavelength <= 0) {
    throw new RangeError(`Wavelength must be a finite positive number (got ${String(wavelength)})`);
  }
  return d * wavelength;
}

/**
 * λ = v / f with v = velocity factor · c.
 * @param frequency   in hertz, > 0
 * @param velocityFactor  v/c, in (0, 1]
 * @returns wavelength in metres
 */
export function wavelengthFromFrequency(frequency: number, velocityFactor = 1): number {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    throw new RangeError(`Frequency must be a finite positive number of hertz (got ${String(frequency)})`);
  }
  if (!Number.isFinite(velocityFactor) || velocityFactor <= 0 || velocityFactor > 1) {
    throw new RangeError(`Velocity factor must be in (0, 1] (got ${String(velocityFactor)})`);
  }
  return (velocityFactor * SPEED_OF_LIGHT) / frequency;
}

/** Electrical phase length βl in degrees (360° per wavelength). */
export function electricalLengthDegrees(d: number): number {
  assertLength(d);
  return 360 * d;
}

/**
 * The smallest non-negative electrical length d ∈ [0, ½) that rotates
 * `from` onto the direction of `to` (toward the generator). Only the angles
 * matter; returns null when either Γ is zero (direction undefined).
 */
export function electricalLengthBetween(from: Complex, to: Complex): number | null {
  assertComplex(from, 'reflection coefficient');
  assertComplex(to, 'reflection coefficient');
  if (isZero(from) || isZero(to) || !Number.isFinite(abs(from)) || !Number.isFinite(abs(to))) return null;
  // Clockwise rotation in radians, in [0, 2π).
  const clockwise = arg(from) - arg(to);
  const turns = clockwise / (2 * Math.PI);
  const reduced = turns - Math.floor(turns);
  const d = reduced / 2;
  return d >= LINE_PERIOD ? 0 : d;
}

/**
 * The length congruent to `d` (mod ½ λ) nearest to `reference`. Used to keep
 * a length continuous when it is set from an angle, e.g. while dragging.
 */
export function nearestEquivalentLength(d: number, reference: number): number {
  assertLength(d);
  assertLength(reference);
  const k = Math.round((reference - d) / LINE_PERIOD);
  return d + k * LINE_PERIOD;
}
