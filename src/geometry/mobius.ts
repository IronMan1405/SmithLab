/**
 * Möbius maps of a real parameter, M(t) = (a·t + b)/(c·t + d), and the exact
 * image of a real interval under them.
 *
 * The image of the real line under a Möbius map is a generalised circle:
 *
 *   den = c·d̄ − c̄·d   (= 2j·Im(c·d̄))
 *   den = 0  →  a straight line (the pole −d/c is real, or c = 0)
 *   den ≠ 0  →  circle with  centre = (a·d̄ − b·c̄)/den,  radius = |a·d − b·c|/|den|
 *
 * So the image of a finite interval that avoids the pole is an exact arc
 * (or segment) of that circle: no fitting from samples is involved. Points
 * of the arc are M(t) evaluated exactly.
 */
import { type Complex, abs, add, arg, complex, conj, div, mul, sub } from '../core';
import type { Shape } from './shapes';

export interface Mobius {
  readonly a: Complex;
  readonly b: Complex;
  readonly c: Complex;
  readonly d: Complex;
}

export function mobius(a: Complex, b: Complex, c: Complex, d: Complex): Mobius {
  return { a, b, c, d };
}

/** f ∘ g (apply g first), i.e. the matrix product F·G. */
export function compose(f: Mobius, g: Mobius): Mobius {
  return {
    a: add(mul(f.a, g.a), mul(f.b, g.c)),
    b: add(mul(f.a, g.b), mul(f.b, g.d)),
    c: add(mul(f.c, g.a), mul(f.d, g.c)),
    d: add(mul(f.c, g.b), mul(f.d, g.d)),
  };
}

/** M(t) for real t (complex infinity at the pole). */
export function applyMobius(m: Mobius, t: number): Complex {
  const tt = complex(t, 0);
  return div(add(mul(m.a, tt), m.b), add(mul(m.c, tt), m.d));
}

/** Real parameter of the pole (where c·t + d = 0), or null if there is no real pole. */
export function realPole(m: Mobius): number | null {
  if (m.c.re === 0 && m.c.im === 0) return null;
  const p = div(complex(-m.d.re, -m.d.im), m.c);
  return Math.abs(p.im) <= 1e-15 * Math.max(1, abs(p)) ? p.re : null;
}

export type RealLineImage =
  | { readonly kind: 'circle'; readonly center: Complex; readonly radius: number }
  | { readonly kind: 'line' };

export function realLineImage(m: Mobius): RealLineImage {
  const den = sub(mul(m.c, conj(m.d)), mul(conj(m.c), m.d));
  // den is purely imaginary; it is (relatively) zero exactly when the image is a line.
  const scale = abs(m.c) * abs(m.d);
  if (abs(den) <= 1e-15 * scale || abs(den) === 0) return { kind: 'line' };
  const center = div(sub(mul(m.a, conj(m.d)), mul(m.b, conj(m.c))), den);
  const radius = abs(sub(mul(m.a, m.d), mul(m.b, m.c))) / abs(den);
  return { kind: 'circle', center, radius };
}

const TWO_PI = 2 * Math.PI;
export const NEAR_LINE_RADIUS = 1e6;
const positiveAngle = (x: number) => ((x % TWO_PI) + TWO_PI) % TWO_PI;

/**
 * Exact image of the real interval traversed from t0 to t1 (either order),
 * which must not contain the pole. Runs from M(t0) to M(t1); the arc's
 * direction is fixed by the exact image of the midpoint.
 *
 * Unlike the general `arcThrough`, this never turns a very short arc into a
 * full circle: a finite interval avoiding the pole maps to less than a full
 * turn, so nearly coincident endpoints simply mean a tiny sweep.
 */
export function realIntervalImage(m: Mobius, t0: number, t1: number): Shape {
  const pole = realPole(m);
  if (pole !== null && pole >= Math.min(t0, t1) && pole <= Math.max(t0, t1)) {
    throw new RangeError('The interval contains the pole of the map');
  }
  const start = applyMobius(m, t0);
  const end = applyMobius(m, t1);
  const via = applyMobius(m, (t0 + t1) / 2);
  const image = realLineImage(m);
  // A (near-)straight image: a circle of radius > 1e6 is indistinguishable
  // from its chord at chart scale, and its centre would be numerically noisy.
  if (image.kind === 'line' || image.radius > NEAR_LINE_RADIUS) return { kind: 'segment', start, end };
  const { center, radius } = image;
  const a0 = arg(sub(start, center));
  const ccwEnd = positiveAngle(arg(sub(end, center)) - a0);
  const ccwVia = positiveAngle(arg(sub(via, center)) - a0);
  // Counter-clockwise when the midpoint lies on the CCW way from start to end.
  let sweep = ccwVia <= ccwEnd ? ccwEnd : ccwEnd - TWO_PI;
  // Local tiny-sweep guard: endpoints that round to the same angle are a
  // degenerate (zero-length) arc, never a full turn.
  if (ccwEnd === 0 || Math.abs(sweep) >= TWO_PI - 1e-12) sweep = 0;
  return { kind: 'arc', center, radius, start, end, startAngle: a0, sweep };
}
