/**
 * Geometric primitives in the Γ-plane, plus the construction of an arc on a
 * known circle from three points on it.
 *
 * Angles are mathematical: measured from +u, counter-clockwise positive.
 */
import { type Complex, approxEqual, arg, complex, isFiniteComplex, sub } from '../core';

/** Γ = 0: centre of the chart and of every constant-|Γ| circle. */
export const ZERO_CENTER: Complex = Object.freeze(complex(0, 0));

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

/**
 * e^(jθ), exact at multiples of π/2 (so a half-turn maps Γ to exactly −Γ).
 */
export function unitPhasor(theta: number): Complex {
  if (!Number.isFinite(theta)) throw new RangeError(`Rotation angle must be finite (got ${theta})`);
  const quarters = theta / (Math.PI / 2);
  const k = Math.round(quarters);
  if (Math.abs(quarters - k) < 1e-12) {
    const q = ((k % 4) + 4) % 4;
    return [complex(1, 0), complex(0, 1), complex(-1, 0), complex(0, -1)][q]!;
  }
  return complex(Math.cos(theta), Math.sin(theta));
}

/** Rotate a Γ-plane point about Γ = 0 by multiplying with a unit phasor (no signed zeros). */
export function rotatePoint(p: Complex, phasor: Complex): Complex {
  return complex(p.re * phasor.re - p.im * phasor.im + 0, p.re * phasor.im + p.im * phasor.re + 0);
}

/**
 * Exact rotation of a shape about Γ = 0 by θ radians. Circles stay circles,
 * arcs keep their radius, sweep (so their direction of travel) and extent,
 * segments keep their length; nothing is resampled.
 */
export function rotateShape(shape: Shape, theta: number): Shape {
  const ph = unitPhasor(theta);
  switch (shape.kind) {
    case 'circle':
      return { ...shape, center: rotatePoint(shape.center, ph) };
    case 'arc':
      return {
        ...shape,
        center: rotatePoint(shape.center, ph),
        start: rotatePoint(shape.start, ph),
        end: rotatePoint(shape.end, ph),
        startAngle: shape.startAngle + theta,
      };
    case 'segment':
      return { ...shape, start: rotatePoint(shape.start, ph), end: rotatePoint(shape.end, ph) };
  }
}
