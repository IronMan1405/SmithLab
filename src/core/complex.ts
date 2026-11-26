/**
 * Complex-number arithmetic on the extended complex plane (Riemann sphere).
 *
 * Representation
 * --------------
 * A complex number is an immutable `{ re, im }` record. All functions are pure
 * and return new values.
 *
 * Numerical conventions
 * ---------------------
 * The Smith Chart is a Möbius transform, so it is natural to work on the
 * extended complex plane ℂ ∪ {∞}, which has a *single* point at infinity:
 *
 *   - Any value with an infinite component is treated as complex infinity.
 *     The canonical representative is `COMPLEX_INFINITY = { re: +∞, im: 0 }`.
 *     Use `isInfinite()` to test for it; never compare components directly.
 *   - `a / 0 = ∞` for a ≠ 0, and `a / ∞ = 0` for finite a.
 *   - Indeterminate forms (`0/0`, `∞/∞`, `∞·0`, `∞ ± ∞`) yield NaN
 *     (`isNaNComplex()` returns true). NaN is never produced silently from
 *     well-defined inputs.
 *   - Overflow of a finite operation (e.g. 1e200 · 1e200) yields ∞.
 *   - `arg(0)` is defined as 0; `arg(∞)` is NaN (direction is undefined on
 *     the Riemann sphere).
 *
 * Domain-level functions (impedance, reflection, VSWR, …) validate their
 * inputs with `assertComplex()` and throw instead of propagating NaN.
 */

export interface Complex {
  readonly re: number;
  readonly im: number;
}

export function complex(re: number, im = 0): Complex {
  return { re, im };
}

export const ZERO: Complex = Object.freeze(complex(0, 0));
export const ONE: Complex = Object.freeze(complex(1, 0));
export const J: Complex = Object.freeze(complex(0, 1));
export const COMPLEX_INFINITY: Complex = Object.freeze(complex(Infinity, 0));
export const COMPLEX_NAN: Complex = Object.freeze(complex(NaN, NaN));

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

export function isNaNComplex(a: Complex): boolean {
  return Number.isNaN(a.re) || Number.isNaN(a.im);
}

/** True for the point at infinity (any infinite component, no NaN). */
export function isInfinite(a: Complex): boolean {
  return !isNaNComplex(a) && (!Number.isFinite(a.re) || !Number.isFinite(a.im));
}

/** True when both components are finite numbers. */
export function isFiniteComplex(a: Complex): boolean {
  return Number.isFinite(a.re) && Number.isFinite(a.im);
}

export function isZero(a: Complex): boolean {
  return a.re === 0 && a.im === 0;
}

/**
 * Approximate equality using a mixed absolute/relative tolerance.
 * Two infinities are equal; NaN is never equal to anything.
 */
export function approxEqual(a: Complex, b: Complex, tolerance = 1e-12): boolean {
  if (isNaNComplex(a) || isNaNComplex(b)) return false;
  if (isInfinite(a) || isInfinite(b)) return isInfinite(a) && isInfinite(b);
  const scale = Math.max(1, abs(a), abs(b));
  return abs(sub(a, b)) <= tolerance * scale;
}

/**
 * Throws a RangeError when `a` is NaN or not a number pair. Used by domain
 * functions so invalid input fails loudly instead of producing garbage.
 */
export function assertComplex(a: Complex, name = 'value'): void {
  if (typeof a !== 'object' || a === null || typeof a.re !== 'number' || typeof a.im !== 'number') {
    throw new TypeError(`${name} must be a Complex { re, im }`);
  }
  if (isNaNComplex(a)) {
    throw new RangeError(`${name} is not a number (NaN)`);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Collapse any infinite result onto the canonical point at infinity. */
function canonical(a: Complex): Complex {
  if (isNaNComplex(a)) return COMPLEX_NAN;
  if (!isFiniteComplex(a)) return COMPLEX_INFINITY;
  return a;
}

/**
 * Finite operands whose finite-precision product/quotient overflowed can
 * produce `∞ - ∞ = NaN` in a component. Since the operands were finite and
 * well defined, the true result is enormous, i.e. ∞ on the Riemann sphere.
 */
function overflowSafe(result: Complex): Complex {
  return isNaNComplex(result) ? COMPLEX_INFINITY : canonical(result);
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

export function add(a: Complex, b: Complex): Complex {
  if (isNaNComplex(a) || isNaNComplex(b)) return COMPLEX_NAN;
  const aInf = isInfinite(a);
  const bInf = isInfinite(b);
  if (aInf && bInf) return COMPLEX_NAN;
  if (aInf || bInf) return COMPLEX_INFINITY;
  return canonical(complex(a.re + b.re, a.im + b.im));
}

export function neg(a: Complex): Complex {
  if (isNaNComplex(a)) return COMPLEX_NAN;
  if (isInfinite(a)) return COMPLEX_INFINITY;
  return complex(-a.re, -a.im);
}

export function sub(a: Complex, b: Complex): Complex {
  return add(a, neg(b));
}

export function mul(a: Complex, b: Complex): Complex {
  if (isNaNComplex(a) || isNaNComplex(b)) return COMPLEX_NAN;
  const aInf = isInfinite(a);
  const bInf = isInfinite(b);
  if (aInf || bInf) {
    return isZero(a) || isZero(b) ? COMPLEX_NAN : COMPLEX_INFINITY;
  }
  return overflowSafe(complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re));
}

/** Multiply by a real scalar. */
export function scale(a: Complex, k: number): Complex {
  return mul(a, complex(k, 0));
}

/**
 * Complex division using Smith's algorithm (1962), which avoids the
 * intermediate overflow/underflow of the textbook (a·conj(b)) / |b|² form.
 */
export function div(a: Complex, b: Complex): Complex {
  if (isNaNComplex(a) || isNaNComplex(b)) return COMPLEX_NAN;
  const aInf = isInfinite(a);
  const bInf = isInfinite(b);
  if (aInf && bInf) return COMPLEX_NAN;
  if (isZero(b)) return isZero(a) ? COMPLEX_NAN : COMPLEX_INFINITY;
  if (aInf) return COMPLEX_INFINITY;
  if (bInf) return ZERO;

  let re: number;
  let im: number;
  if (Math.abs(b.re) >= Math.abs(b.im)) {
    const ratio = b.im / b.re;
    const denom = b.re + b.im * ratio;
    re = (a.re + a.im * ratio) / denom;
    im = (a.im - a.re * ratio) / denom;
  } else {
    const ratio = b.re / b.im;
    const denom = b.re * ratio + b.im;
    re = (a.re * ratio + a.im) / denom;
    im = (a.im * ratio - a.re) / denom;
  }
  return overflowSafe(complex(re, im));
}

/** 1 / a, with 1/0 = ∞ and 1/∞ = 0. */
export function reciprocal(a: Complex): Complex {
  return div(ONE, a);
}

export function conj(a: Complex): Complex {
  if (isNaNComplex(a)) return COMPLEX_NAN;
  if (isInfinite(a)) return COMPLEX_INFINITY;
  return complex(a.re, -a.im);
}

// ---------------------------------------------------------------------------
// Polar form
// ---------------------------------------------------------------------------

/** Magnitude |a|. Returns +∞ for complex infinity and NaN for NaN. */
export function abs(a: Complex): number {
  if (isNaNComplex(a)) return NaN;
  if (isInfinite(a)) return Infinity;
  return Math.hypot(a.re, a.im);
}

/**
 * Argument in radians, in (-π, π]. arg(0) = 0 by convention (including
 * signed zeros); arg(∞) = NaN.
 */
export function arg(a: Complex): number {
  if (isNaNComplex(a) || isInfinite(a)) return NaN;
  if (isZero(a)) return 0;
  return Math.atan2(a.im, a.re);
}

export function fromPolar(magnitude: number, angle: number): Complex {
  if (magnitude === Infinity) return COMPLEX_INFINITY;
  return complex(magnitude * Math.cos(angle), magnitude * Math.sin(angle));
}
