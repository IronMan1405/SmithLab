/**
 * Geometric primitives in the Γ-plane, plus the construction of an arc on a
 * known circle from three points on it.
 *
 * Angles are mathematical: measured from +u, counter-clockwise positive.
 */
import { type Complex, approxEqual, arg, isFiniteComplex, sub } from '../core';

export interface CircleGeometry {
  readonly center: Complex;
  readonly radius: number;
}

export interface CircleShape extends CircleGeometry {
  readonly kind: 'circle';
}

export interface ArcShape extends CircleGeometry {
  readonly kind: 'arc';
  readonly start: Complex;
  readonly end: Complex;
  /** Angle of `start` about `center`, radians. */
  readonly startAngle: number;
  /** Signed angular extent from start to end: > 0 counter-clockwise. |sweep| < 2π. */
  readonly sweep: number;
}

export interface SegmentShape {
  readonly kind: 'segment';
  readonly start: Complex;
  readonly end: Complex;
}

export type Shape = CircleShape | ArcShape | SegmentShape;

const TWO_PI = 2 * Math.PI;

function positiveAngle(angle: number): number {
  const a = angle % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

/** Points closer than this (in Γ units) are considered coincident. */
const COINCIDENT = 1e-9;

/**
 * Build the arc of `circle` that starts at `start`, passes through `via`
 * and ends at `end`. All three points must lie on the circle. If start and
 * end coincide, the full circle is returned.
 */
export function arcThrough(circle: CircleGeometry, start: Complex, via: Complex, end: Complex): Shape {
  if (!isFiniteComplex(start) || !isFiniteComplex(via) || !isFiniteComplex(end)) {
    throw new RangeError('Arc points must be finite');
  }
  if (approxEqual(start, end, COINCIDENT)) {
    return { kind: 'circle', center: circle.center, radius: circle.radius };
  }
  const startAngle = arg(sub(start, circle.center));
  const ccwToEnd = positiveAngle(arg(sub(end, circle.center)) - startAngle);
  const ccwToVia = positiveAngle(arg(sub(via, circle.center)) - startAngle);
  const sweep = ccwToVia < ccwToEnd ? ccwToEnd : ccwToEnd - TWO_PI;
  return { kind: 'arc', center: circle.center, radius: circle.radius, start, end, startAngle, sweep };
}

/**
 * A parameter value strictly between `from` and `to` (either may be ±∞),
 * used to disambiguate which way round a circle an arc travels.
 */
export function interiorParameter(from: number, to: number): number {
  if (Number.isFinite(from) && Number.isFinite(to)) return (from + to) / 2;
  if (!Number.isFinite(from) && !Number.isFinite(to)) return 0;
  if (Number.isFinite(from)) return from + Math.max(1, Math.abs(from));
  return to - Math.max(1, Math.abs(to));
}

export function assertRange(from: number, to: number, name: string): void {
  if (Number.isNaN(from) || Number.isNaN(to) || !(from < to)) {
    throw new RangeError(`${name} range must satisfy from < to (got [${from}, ${to}])`);
  }
}
