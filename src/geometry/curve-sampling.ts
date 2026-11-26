/**
 * Adaptive sampling of parametric curves Γ(t) for display and numerics.
 *
 * Strategy
 * --------
 * 1. Evaluate on an initial uniform grid of `initialSegments` intervals.
 * 2. Recursively bisect an interval while
 *      - the midpoint deviates from the chord by more than `tolerance`
 *        (chord error, i.e. visible flatness), or
 *      - the chord is longer than `maxSegmentLength` (guards against
 *        features hidden between coarse samples), or
 *      - the midpoint collapses onto one end of the chord (how a jump
 *        looks from outside), or
 *      - the curve crosses the unit circle inside it (for exact clipping),
 *    up to `maxDepth` levels and an overall evaluation budget.
 * 3. Singularities: where `point(t)` returns null or a non-finite value the
 *    polyline is broken; bisection localises the undefined region.
 * 4. Discontinuities: if an interval is still longer than
 *    `jumpThreshold` at the maximum depth it is treated as a jump and the
 *    polyline is broken instead of drawing a connecting segment.
 * 5. Clipping: with `clipToDisc`, only parts with |Γ| ≤ 1 are kept; each
 *    crossing of the unit circle is located by bisection on |Γ(t)| − 1.
 *
 * Output is a list of polylines of (t, Γ) samples; no SVG coordinates.
 */
import { type Complex, abs } from '../core';

export interface SamplePoint {
  readonly t: number;
  readonly p: Complex;
}
export type Polyline = readonly SamplePoint[];

export interface SampleOptions {
  /** Maximum allowed chord deviation, in Γ units. */
  readonly tolerance: number;
  readonly initialSegments?: number;
  readonly maxDepth?: number;
  readonly maxSegmentLength?: number;
  readonly jumpThreshold?: number;
  readonly clipToDisc?: boolean;
  /** Upper bound on point evaluations. */
  readonly budget?: number;
}

export interface SampleResult {
  readonly polylines: readonly Polyline[];
  readonly evaluations: number;
  /** True when the evaluation budget stopped refinement early. */
  readonly truncated: boolean;
}

function finite(p: Complex | null): p is Complex {
  return p !== null && Number.isFinite(p.re) && Number.isFinite(p.im);
}

function distanceToSegment(p: Complex, a: Complex, b: Complex): number {
  const dx = b.re - a.re;
  const dy = b.im - a.im;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.re - a.re, p.im - a.im);
  const u = Math.max(0, Math.min(1, ((p.re - a.re) * dx + (p.im - a.im) * dy) / len2));
  return Math.hypot(p.re - (a.re + u * dx), p.im - (a.im + u * dy));
}

export function sampleCurve(point: (t: number) => Complex | null, t0: number, t1: number, options: SampleOptions): SampleResult {
  const tolerance = Math.max(options.tolerance, 1e-12);
  const initial = options.initialSegments ?? 64;
  const maxDepth = options.maxDepth ?? 16;
  const maxSegment = options.maxSegmentLength ?? 0.05;
  const jump = options.jumpThreshold ?? 1e-3;
  const clip = options.clipToDisc ?? true;
  const budget = options.budget ?? 30000;

  let evaluations = 0;
  let truncated = false;
  const evalAt = (t: number): { t: number; p: Complex | null } => {
    evaluations++;
    let p: Complex | null;
    try {
      p = point(t);
    } catch {
      p = null;
    }
    return { t, p: finite(p) ? p : null };
  };
  const inside = (p: Complex) => !clip || abs(p) <= 1 + 1e-12;

  const polylines: SamplePoint[][] = [];
  let current: SamplePoint[] = [];
  const flush = () => {
    if (current.length >= 2) polylines.push(current);
    current = [];
  };
  const emit = (s: SamplePoint) => {
    const last = current[current.length - 1];
    if (!last || last.t !== s.t) current.push(s);
  };

  /** Point on the unit circle between an inside and an outside sample. */
  const crossing = (a: SamplePoint, b: SamplePoint): SamplePoint => {
    let lo = a;
    let hi = b;
    const aInside = inside(a.p);
    for (let i = 0; i < 48; i++) {
      const m = evalAt((lo.t + hi.t) / 2);
      if (!m.p) break;
      const mm = { t: m.t, p: m.p };
      if (inside(mm.p) === aInside) lo = mm;
      else hi = mm;
    }
    // Project onto the circle to remove the residual (|Γ| within ~1e-14 of 1).
    const q = aInside ? hi : lo;
    const m = abs(q.p);
    const projected = m > 0 ? { re: q.p.re / m, im: q.p.im / m } : q.p;
    return { t: q.t, p: projected };
  };

  const segment = (a: { t: number; p: Complex | null }, b: { t: number; p: Complex | null }, depth: number): void => {
    const canRefine = depth < maxDepth && evaluations < budget;
    if (!canRefine && depth < maxDepth) truncated = true;

    if (!a.p || !b.p) {
      if (canRefine) {
        const m = evalAt((a.t + b.t) / 2);
        segment(a, m, depth + 1);
        segment(m, b, depth + 1);
        return;
      }
      flush();
      if (b.p && inside(b.p)) emit({ t: b.t, p: b.p });
      return;
    }

    const A = { t: a.t, p: a.p };
    const B = { t: b.t, p: b.p };
    const ia = inside(A.p);
    const ib = inside(B.p);
    const chord = abs({ re: B.p.re - A.p.re, im: B.p.im - A.p.im });

    if (canRefine) {
      const m = evalAt((a.t + b.t) / 2);
      const deviation = m.p ? distanceToSegment(m.p, A.p, B.p) : Infinity;
      // On a smooth curve the midpoint lies well inside the chord; one that
      // collapses onto an endpoint signals a jump (or a very uneven speed).
      const lopsided =
        m.p !== null &&
        chord > tolerance &&
        Math.min(abs({ re: m.p.re - A.p.re, im: m.p.im - A.p.im }), abs({ re: m.p.re - B.p.re, im: m.p.im - B.p.im })) < 0.25 * chord;
      const relevant = ia || ib || (m.p !== null && inside(m.p));
      const needs =
        relevant && (deviation > tolerance || chord > maxSegment || lopsided || (m.p !== null && inside(m.p) !== ia));
      if (needs || !m.p) {
        segment(a, m, depth + 1);
        segment(m, b, depth + 1);
        return;
      }
    }

    // Leaf interval.
    if (depth >= maxDepth && chord > jump) {
      flush(); // discontinuity: do not connect across it
      if (ib) emit(B);
      return;
    }
    if (ia && ib) emit(B);
    else if (ia && !ib) {
      emit(crossing(A, B));
      flush();
    } else if (!ia && ib) {
      flush();
      emit(crossing(A, B));
      emit(B);
    }
  };

  let prev = evalAt(t0);
  if (prev.p && inside(prev.p)) emit({ t: prev.t, p: prev.p });
  for (let i = 1; i <= initial; i++) {
    const next = evalAt(i === initial ? t1 : t0 + ((t1 - t0) * i) / initial);
    segment(prev, next, 0);
    prev = next;
  }
  flush();
  return { polylines, evaluations, truncated };
}
