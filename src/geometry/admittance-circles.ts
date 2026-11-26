/**
 * Constant-conductance and constant-susceptance curves of the admittance
 * chart. With y = g + jb and Γ = (1 − y)/(1 + y):
 *
 *   constant g:  (u + g/(1+g))² + v² = (1/(1+g))²
 *   constant b:  (u + 1)² + (v + 1/b)² = (1/b)²
 *
 * i.e. the impedance chart rotated by 180° about Γ = 0. Positive
 * susceptance (capacitive) lies in the lower half of the chart.
 */
import { type Complex, COMPLEX_INFINITY, complex, reflectionFromAdmittance } from '../core';
import { type CircleGeometry, type Shape, arcThrough, assertRange, interiorParameter } from './shapes';

function admittancePoint(g: number, b: number): Complex {
  if (!Number.isFinite(g) || !Number.isFinite(b)) return reflectionFromAdmittance(COMPLEX_INFINITY);
  return reflectionFromAdmittance(complex(g, b));
}

export function conductanceCircle(g: number): CircleGeometry {
  if (Number.isNaN(g) || g < 0) throw new RangeError(`Conductance must be ≥ 0 (got ${g})`);
  if (g === Infinity) return { center: complex(-1, 0), radius: 0 };
  return { center: complex(-g / (1 + g), 0), radius: 1 / (1 + g) };
}

export function susceptanceCircle(b: number): CircleGeometry {
  if (!Number.isFinite(b) || b === 0) {
    throw new RangeError(`Susceptance circle needs a finite non-zero b (got ${b}); b = 0 is the real axis`);
  }
  return { center: complex(-1, -1 / b), radius: 1 / Math.abs(b) };
}

export function conductanceCurve(g: number, bFrom = -Infinity, bTo = Infinity): Shape {
  if (!Number.isFinite(g) || g < 0) throw new RangeError(`Conductance curve needs a finite g ≥ 0 (got ${g})`);
  assertRange(bFrom, bTo, 'Susceptance');
  return arcThrough(
    conductanceCircle(g),
    admittancePoint(g, bFrom),
    admittancePoint(g, interiorParameter(bFrom, bTo)),
    admittancePoint(g, bTo),
  );
}

export function susceptanceCurve(b: number, gFrom = 0, gTo = Infinity): Shape {
  if (!Number.isFinite(b)) throw new RangeError(`Susceptance curve needs a finite b (got ${b})`);
  assertRange(gFrom, gTo, 'Conductance');
  if (gFrom < 0) throw new RangeError(`Conductance range must start at g ≥ 0 (got ${gFrom})`);
  if (b === 0) {
    return { kind: 'segment', start: admittancePoint(gFrom, 0), end: admittancePoint(gTo, 0) };
  }
  return arcThrough(
    susceptanceCircle(b),
    admittancePoint(gFrom, b),
    admittancePoint(interiorParameter(gFrom, gTo), b),
    admittancePoint(gTo, b),
  );
}
