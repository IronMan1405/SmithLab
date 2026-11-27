/**
 * Exact loci of series and shunt element sweeps (seriesPath / shuntPath).
 *
 * In the operation's own domain (z for series, y for shunt) the result is
 *   native element (plain, same-domain, Ω for series):  u(t) = w + (α + β t)
 *   cross-domain element (y for series; z, Ω for shunt): u(t) = w + 1/(α + β t)
 * where w is the point's number in that domain and t is the element's own
 * represented value along the sweep. The curve's canonical position is
 *   κ(t) = σ · C_Z(u(t)),   C_Z(u) = (u − 1)/(u + 1),   σ = ±1
 * (σ from the point's type, see curve-functions.ts). κ is a Möbius map of t,
 * so the swept locus is an exact arc or segment (mobius.ts).
 *
 * Clipping: |κ| ≤ 1 ⇔ Re u ≥ 0 (because Re(1/u) = Re u/|u|²). This is
 * solved exactly in t:
 *   native: Re u is linear in t → one cut point;
 *   cross:  Re u ≥ 0 ⇔ Re(w)|q|² + Re q ≥ 0 with q = α + βt → a quadratic.
 * The pole of κ (u = −1) has Re u = −1 and therefore never lies in a passive
 * interval, so a drawn arc never passes through infinity.
 */
import { type Complex, add, complex, div, isFiniteComplex, mul } from '../core';
import type { Curve, CurveDomain, CurveFrame, CurveProperty } from './curves';
import { type Mobius, applyMobius, compose, mobius, realIntervalImage } from './mobius';

export interface ElementSweepSpec {
  readonly operation: 'series' | 'shunt';
  /** Point's number in the operation's domain (finite). */
  readonly w: Complex;
  /** +1 or −1: κ = σ·C_Z(u). */
  readonly sigma: 1 | -1;
  readonly cross: boolean;
  /** Element (own value, normalised into the domain's scale) is α + β·t. */
  readonly alpha: Complex;
  readonly beta: Complex;
  /** Sweep from t0 (e0) to t1 (e1); t0 ≠ t1. */
  readonly t0: number;
  readonly t1: number;
  readonly parameterName: string;
  readonly parameterUnit: string;
  readonly frame: CurveFrame;
  readonly domain: CurveDomain | null;
  readonly properties: readonly CurveProperty[];
}

const ONE = complex(1, 0);
const ZERO = complex(0, 0);

/** The Möbius map t ↦ κ(t) for a sweep. */
export function sweepMobius(s: ElementSweepSpec): Mobius {
  // u(t) as a Möbius map of t.
  const u = s.cross
    ? mobius(mul(s.w, s.beta), add(mul(s.w, s.alpha), ONE), s.beta, s.alpha)
    : mobius(s.beta, add(s.w, s.alpha), ZERO, ONE);
  const cz = mobius(ONE, complex(-1, 0), ONE, ONE); // C_Z
  const sign = mobius(complex(s.sigma, 0), ZERO, ZERO, ONE);
  return compose(sign, compose(cz, u));
}

/** u(t) evaluated directly (complex infinity where a cross element is 0). */
export function sweepU(s: ElementSweepSpec, t: number): Complex {
  const q = add(s.alpha, mul(s.beta, complex(t, 0)));
  return add(s.w, s.cross ? div(ONE, q) : q);
}

/** Sub-intervals of [lo, hi] where Re u(t) ≥ 0 (the passive part), in increasing order. */
export function passiveIntervals(s: ElementSweepSpec): [number, number][] {
  const lo = Math.min(s.t0, s.t1);
  const hi = Math.max(s.t0, s.t1);
  let roots: number[];
  let f: (t: number) => number;
  if (!s.cross) {
    const c0 = s.w.re + s.alpha.re;
    const c1 = s.beta.re;
    f = (t) => c0 + c1 * t;
    roots = c1 !== 0 ? [-c0 / c1] : [];
  } else {
    const rw = s.w.re;
    const A = rw * (s.beta.re ** 2 + s.beta.im ** 2);
    const B = 2 * rw * (s.alpha.re * s.beta.re + s.alpha.im * s.beta.im) + s.beta.re;
    const C = rw * (s.alpha.re ** 2 + s.alpha.im ** 2) + s.alpha.re;
    f = (t) => (A * t + B) * t + C;
    if (A === 0) roots = B !== 0 ? [-C / B] : [];
    else {
      const disc = B * B - 4 * A * C;
      if (disc < 0) roots = [];
      else {
        // Numerically stable quadratic roots.
        const qq = -0.5 * (B + Math.sign(B || 1) * Math.sqrt(disc));
        roots = [qq / A, qq !== 0 ? C / qq : -B / (2 * A)];
      }
    }
  }
  const cuts = [lo, ...roots.filter((r) => r > lo && r < hi).sort((x, y) => x - y), hi];
  const intervals: [number, number][] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i]!;
    const b = cuts[i + 1]!;
    if (b <= a) continue;
    if (f((a + b) / 2) >= 0) {
      const last = intervals[intervals.length - 1];
      if (last && last[1] === a) last[1] = b;
      else intervals.push([a, b]);
    }
  }
  return intervals;
}

export function elementSweepCurve(s: ElementSweepSpec): Curve {
  if (!(s.t0 !== s.t1) || !Number.isFinite(s.t0) || !Number.isFinite(s.t1)) {
    throw new RangeError('A sweep needs two different, finite element values');
  }
  if (!isFiniteComplex(s.w)) throw new RangeError('The point cannot be moved by this element');
  const intervals = passiveIntervals(s);
  if (intervals.length === 0) throw new RangeError('The sweep never reaches the passive chart (|Γ| ≤ 1)');
  const m = sweepMobius(s);
  const increasing = s.t1 > s.t0;
  const inside = (t: number) => intervals.some(([a, b]) => t >= a && t <= b);

  // Exact shape over the single passive interval, oriented from the e0 side.
  // Each passive interval is an exact arc/segment; several of them are kept as
  // exact pieces (never sampled: near an open/short end of a cross-domain
  // element the locus moves like 1/t², which defeats uniform-parameter sampling).
  const oriented = (increasing ? intervals : [...intervals].reverse()).map(([a, b]) =>
    increasing ? realIntervalImage(m, a, b) : realIntervalImage(m, b, a),
  );
  const shape: Curve['shape'] = oriented.length === 1 ? oriented[0]! : null;
  const lo = Math.min(s.t0, s.t1);
  const hi = Math.max(s.t0, s.t1);
  return {
    kind: s.operation === 'series' ? 'seriesPath' : 'shuntPath',
    frame: s.frame,
    domain: s.domain,
    anchor: null,
    label: `${s.operation} element sweep`,
    properties: s.properties,
    shape,
    parameter: { name: s.parameterName, min: lo, max: hi, unit: s.parameterUnit },
    passive: intervals,
    ...(oriented.length > 1 ? { pieces: oriented } : {}),
    point: (t) => {
      if (!inside(t)) return null;
      // The same exact map that defines the shape (finite even where a
      // cross-domain element is 0, i.e. an open/short end).
      const k = applyMobius(m, t);
      return complex(k.re + 0, k.im + 0);
    },
  };
}
