/**
 * Constant-resistance and constant-reactance curves of the impedance chart.
 *
 * With z = r + jx and Γ = u + jv:
 *
 *   constant r:  (u − r/(1+r))² + v² = (1/(1+r))²
 *   constant x:  (u − 1)² + (v − 1/x)² = (1/x)²
 *
 * Circle centres and radii come from these closed forms. The *endpoints* of
 * each arc are found by mapping impedances through the core Γ(z) function,
 * so the two independent derivations cross-check each other in the tests.
 */
import { type Complex, COMPLEX_INFINITY, complex, reflectionFromImpedance } from '../core';
import { type CircleGeometry, type Shape, arcThrough, assertRange, interiorParameter } from './shapes';

function impedancePoint(r: number, x: number): Complex {
  if (!Number.isFinite(r) || !Number.isFinite(x)) return reflectionFromImpedance(COMPLEX_INFINITY);
  return reflectionFromImpedance(complex(r, x));
}

/** Circle of constant normalised resistance r ≥ 0. r = ∞ degenerates to the point Γ = 1. */
export function resistanceCircle(r: number): CircleGeometry {
  if (Number.isNaN(r) || r < 0) throw new RangeError(`Resistance must be ≥ 0 (got ${r})`);
  if (r === Infinity) return { center: complex(1, 0), radius: 0 };
  return { center: complex(r / (1 + r), 0), radius: 1 / (1 + r) };
}

/** Circle of constant normalised reactance x ≠ 0 (x = 0 is the real axis). */
export function reactanceCircle(x: number): CircleGeometry {
  if (!Number.isFinite(x) || x === 0) {
    throw new RangeError(`Reactance circle needs a finite non-zero x (got ${x}); x = 0 is the real axis`);
  }
  return { center: complex(1, 1 / x), radius: 1 / Math.abs(x) };
}

/**
 * The part of the constant-r circle for reactances in [xFrom, xTo].
 * The default range (−∞, ∞) gives the full circle.
 */
export function resistanceCurve(r: number, xFrom = -Infinity, xTo = Infinity): Shape {
  if (!Number.isFinite(r) || r < 0) throw new RangeError(`Resistance curve needs a finite r ≥ 0 (got ${r})`);
  assertRange(xFrom, xTo, 'Reactance');
  return arcThrough(
    resistanceCircle(r),
    impedancePoint(r, xFrom),
    impedancePoint(r, interiorParameter(xFrom, xTo)),
    impedancePoint(r, xTo),
  );
}

/**
 * The part of the constant-x curve for resistances in [rFrom, rTo] ⊆ [0, ∞].
 * x = 0 yields a straight segment of the real axis.
 */
export function reactanceCurve(x: number, rFrom = 0, rTo = Infinity): Shape {
  if (!Number.isFinite(x)) throw new RangeError(`Reactance curve needs a finite x (got ${x})`);
  assertRange(rFrom, rTo, 'Resistance');
  if (rFrom < 0) throw new RangeError(`Resistance range must start at r ≥ 0 (got ${rFrom})`);
  if (x === 0) {
    return { kind: 'segment', start: impedancePoint(rFrom, 0), end: impedancePoint(rTo, 0) };
  }
  return arcThrough(
    reactanceCircle(x),
    impedancePoint(rFrom, x),
    impedancePoint(interiorParameter(rFrom, rTo), x),
    impedancePoint(rTo, x),
  );
}
