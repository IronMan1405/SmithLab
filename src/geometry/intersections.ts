/**
 * Intersections between curves.
 *
 * - Exact curves (circles, arcs, segments): analytic circle–circle,
 *   circle–line and line–line intersection, restricted to each arc's
 *   angular range or segment extent. Tangency (a single touching point) is
 *   detected within `tolerance`. Coincident curves are reported as such.
 *   When nothing intersects, the closest approach of the underlying circles
 *   or lines is reported so near-misses are visible as near-misses.
 * - General parametric curves: numerical. Against an exact curve, sign
 *   changes of the implicit function along an adaptive sampling are refined
 *   by bisection. Between two parametric curves, crossings of their sampled
 *   polylines are refined by Newton's method on Γ₁(t) − Γ₂(s) = 0.
 *   Tangencies of parametric curves are not detected.
 *
 * All results lie inside the closed unit disc, are deduplicated within
 * `tolerance`, and are ordered by increasing Re Γ (then decreasing Im Γ).
 */
import { type Complex, abs, arg, complex, sub } from '../core';
import type { Curve } from './curves';
import { type Polyline, sampleCurve } from './curve-sampling';
import type { Shape } from './shapes';

export interface Intersection {
  readonly gamma: Complex;
  /** The curves touch rather than cross. */
  readonly tangent: boolean;
  /** Found numerically (parametric curves), accurate to ~1e-9 in Γ. */
  readonly numerical: boolean;
}

export interface IntersectionResult {
  readonly points: readonly Intersection[];
  /** The curves overlap along an arc (infinitely many common points). */
  readonly coincident: boolean;
  /** For non-intersecting exact curves: distance between the underlying circles/lines. */
  readonly closestApproach: number | null;
}

export const INTERSECTION_TOLERANCE = 1e-9;

const TWO_PI = 2 * Math.PI;
const positiveAngle = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

interface CircleLike {
  readonly c: Complex;
  readonly r: number;
}

function circleOf(shape: Shape): CircleLike | null {
  return shape.kind === 'segment' ? null : { c: shape.center, r: shape.radius };
}

/** Is p (assumed on the shape's circle/line) within the shape's extent? */
function onShape(shape: Shape, p: Complex, tol: number): boolean {
  switch (shape.kind) {
    case 'circle':
      return true;
    case 'arc': {
      const eps = tol / Math.max(shape.radius, 1e-12) + 1e-12;
      const a = arg(sub(p, shape.center));
      const offset = shape.sweep >= 0 ? positiveAngle(a - shape.startAngle) : positiveAngle(shape.startAngle - a);
      return offset <= Math.abs(shape.sweep) + eps || offset >= TWO_PI - eps;
    }
    case 'segment': {
      const d = sub(shape.end, shape.start);
      const len2 = d.re * d.re + d.im * d.im;
      const u = ((p.re - shape.start.re) * d.re + (p.im - shape.start.im) * d.im) / len2;
      const slack = tol / Math.sqrt(len2);
      return u >= -slack && u <= 1 + slack;
    }
  }
}

interface Raw {
  readonly points: Complex[];
  readonly tangent: boolean;
  readonly coincident: boolean;
  readonly gap: number;
}

function circleCircle(a: CircleLike, b: CircleLike, tol: number): Raw {
  const d = abs(sub(b.c, a.c));
  if (d <= tol && Math.abs(a.r - b.r) <= tol) return { points: [], tangent: false, coincident: true, gap: 0 };
  const outer = d - (a.r + b.r);
  const inner = Math.abs(a.r - b.r) - d;
  if (outer > tol || inner > tol || d <= tol) {
    return { points: [], tangent: false, coincident: false, gap: Math.max(outer, inner, 0) };
  }
  const ux = (b.c.re - a.c.re) / d;
  const uy = (b.c.im - a.c.im) / d;
  // Distance from a.c along the centre line to the chord of intersection.
  const along = (d * d + a.r * a.r - b.r * b.r) / (2 * d);
  const h2 = a.r * a.r - along * along;
  const tangent = Math.abs(outer) <= tol || Math.abs(inner) <= tol || h2 <= tol * tol;
  const base = complex(a.c.re + ux * along, a.c.im + uy * along);
  if (tangent) return { points: [base], tangent: true, coincident: false, gap: 0 };
  const h = Math.sqrt(h2);
  return {
    points: [complex(base.re - uy * h, base.im + ux * h), complex(base.re + uy * h, base.im - ux * h)],
    tangent: false,
    coincident: false,
    gap: 0,
  };
}

function circleLine(c: CircleLike, p0: Complex, p1: Complex, tol: number): Raw {
  const d = sub(p1, p0);
  const len = abs(d);
  const ux = d.re / len;
  const uy = d.im / len;
  // Foot of the perpendicular from the centre onto the line.
  const s = (c.c.re - p0.re) * ux + (c.c.im - p0.im) * uy;
  const foot = complex(p0.re + ux * s, p0.im + uy * s);
  const dist = abs(sub(c.c, foot));
  if (dist - c.r > tol) return { points: [], tangent: false, coincident: false, gap: dist - c.r };
  if (Math.abs(dist - c.r) <= tol) return { points: [foot], tangent: true, coincident: false, gap: 0 };
  const h = Math.sqrt(c.r * c.r - dist * dist);
  return {
    points: [complex(foot.re - ux * h, foot.im - uy * h), complex(foot.re + ux * h, foot.im + uy * h)],
    tangent: false,
    coincident: false,
    gap: 0,
  };
}

function lineLine(a0: Complex, a1: Complex, b0: Complex, b1: Complex, tol: number): Raw {
  const r = sub(a1, a0);
  const s = sub(b1, b0);
  const denom = r.re * s.im - r.im * s.re;
  const q = sub(b0, a0);
  if (Math.abs(denom) <= tol * abs(r) * abs(s)) {
    const offset = Math.abs(q.re * r.im - q.im * r.re) / abs(r);
    return { points: [], tangent: false, coincident: offset <= tol, gap: offset };
  }
  const t = (q.re * s.im - q.im * s.re) / denom;
  return { points: [complex(a0.re + t * r.re, a0.im + t * r.im)], tangent: false, coincident: false, gap: 0 };
}

function shapeShape(a: Shape, b: Shape, tol: number): IntersectionResult {
  const ca = circleOf(a);
  const cb = circleOf(b);
  let raw: Raw;
  if (ca && cb) raw = circleCircle(ca, cb, tol);
  else if (ca && b.kind === 'segment') raw = circleLine(ca, b.start, b.end, tol);
  else if (cb && a.kind === 'segment') raw = circleLine(cb, a.start, a.end, tol);
  else if (a.kind === 'segment' && b.kind === 'segment') raw = lineLine(a.start, a.end, b.start, b.end, tol);
  else raw = { points: [], tangent: false, coincident: false, gap: 0 };

  if (raw.coincident) return { points: [], coincident: true, closestApproach: null };
  const points = raw.points
    .filter((p) => onShape(a, p, tol) && onShape(b, p, tol) && abs(p) <= 1 + tol)
    .map((gamma) => ({ gamma, tangent: raw.tangent, numerical: false }));
  return { points: finalize(points, tol), coincident: false, closestApproach: points.length === 0 ? raw.gap : null };
}

/** Signed implicit function of an exact shape: zero on its circle/line. */
function implicit(shape: Shape): (p: Complex) => number {
  if (shape.kind === 'segment') {
    const d = sub(shape.end, shape.start);
    return (p) => (p.re - shape.start.re) * d.im - (p.im - shape.start.im) * d.re;
  }
  return (p) => abs(sub(p, shape.center)) - shape.radius;
}

const NUMERIC_SAMPLING = { tolerance: 1e-5, maxSegmentLength: 0.02, clipToDisc: true, budget: 60000 } as const;

function parametricShape(curve: Curve, shape: Shape): Intersection[] {
  const g = implicit(shape);
  const { polylines } = sampleCurve(curve.point, curve.parameter.min, curve.parameter.max, NUMERIC_SAMPLING);
  const found: Intersection[] = [];
  for (const line of polylines) {
    for (let i = 0; i + 1 < line.length; i++) {
      let a = line[i]!;
      let b = line[i + 1]!;
      let ga = g(a.p);
      const gb = g(b.p);
      if (ga === 0) {
        if (onShape(shape, a.p, 1e-7)) found.push({ gamma: a.p, tangent: false, numerical: true });
        continue;
      }
      if (Math.sign(ga) === Math.sign(gb)) continue;
      for (let k = 0; k < 80 && b.t - a.t > 1e-15; k++) {
        const t = (a.t + b.t) / 2;
        const p = curve.point(t);
        if (!p) break;
        const gm = g(p);
        if (Math.sign(gm) === Math.sign(ga)) {
          a = { t, p };
          ga = gm;
        } else b = { t, p };
      }
      const p = Math.abs(g(a.p)) < Math.abs(g(b.p)) ? a.p : b.p;
      if (Math.abs(g(p)) < 1e-8 && onShape(shape, p, 1e-7)) found.push({ gamma: p, tangent: false, numerical: true });
    }
  }
  return found;
}

function segmentCross(p: Complex, p2: Complex, q: Complex, q2: Complex): [number, number] | null {
  const r = sub(p2, p);
  const s = sub(q2, q);
  const denom = r.re * s.im - r.im * s.re;
  if (denom === 0) return null;
  const qp = sub(q, p);
  const t = (qp.re * s.im - qp.im * s.re) / denom;
  const u = (qp.re * r.im - qp.im * r.re) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}

function newton(a: Curve, b: Curve, t0: number, s0: number): Complex | null {
  let t = t0;
  let s = s0;
  const ha = (a.parameter.max - a.parameter.min) * 1e-7;
  const hb = (b.parameter.max - b.parameter.min) * 1e-7;
  for (let i = 0; i < 40; i++) {
    const pa = a.point(t);
    const pb = b.point(s);
    if (!pa || !pb) return null;
    const F = sub(pa, pb);
    if (abs(F) < 1e-12) return pa;
    const da1 = a.point(t + ha);
    const da0 = a.point(t - ha);
    const db1 = b.point(s + hb);
    const db0 = b.point(s - hb);
    if (!da1 || !da0 || !db1 || !db0) return null;
    const ja = complex((da1.re - da0.re) / (2 * ha), (da1.im - da0.im) / (2 * ha));
    const jb = complex((db1.re - db0.re) / (2 * hb), (db1.im - db0.im) / (2 * hb));
    // Solve [ja, −jb]·[dt, ds]ᵀ = −F (2×2 real system).
    const det = ja.re * -jb.im - -jb.re * ja.im;
    if (Math.abs(det) < 1e-300) return null;
    const dt = (-F.re * -jb.im - -jb.re * -F.im) / det;
    const ds = (ja.re * -F.im - -F.re * ja.im) / det;
    t += dt;
    s += ds;
    if (t < a.parameter.min || t > a.parameter.max || s < b.parameter.min || s > b.parameter.max) return null;
  }
  const pa = a.point(t);
  const pb = b.point(s);
  return pa && pb && abs(sub(pa, pb)) < 1e-9 ? pa : null;
}

function parametricParametric(a: Curve, b: Curve): Intersection[] {
  const la = sampleCurve(a.point, a.parameter.min, a.parameter.max, NUMERIC_SAMPLING).polylines;
  const lb = sampleCurve(b.point, b.parameter.min, b.parameter.max, NUMERIC_SAMPLING).polylines;
  const found: Intersection[] = [];
  const box = (l: Polyline) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const { p } of l) {
      x0 = Math.min(x0, p.re); x1 = Math.max(x1, p.re); y0 = Math.min(y0, p.im); y1 = Math.max(y1, p.im);
    }
    return { x0, x1, y0, y1 };
  };
  for (const pa of la) {
    const ba = box(pa);
    for (const pb of lb) {
      const bb = box(pb);
      if (ba.x1 < bb.x0 || bb.x1 < ba.x0 || ba.y1 < bb.y0 || bb.y1 < ba.y0) continue;
      for (let i = 0; i + 1 < pa.length; i++) {
        for (let k = 0; k + 1 < pb.length; k++) {
          const hit = segmentCross(pa[i]!.p, pa[i + 1]!.p, pb[k]!.p, pb[k + 1]!.p);
          if (!hit) continue;
          const t = pa[i]!.t + hit[0] * (pa[i + 1]!.t - pa[i]!.t);
          const s = pb[k]!.t + hit[1] * (pb[k + 1]!.t - pb[k]!.t);
          const refined = newton(a, b, t, s);
          if (refined) found.push({ gamma: refined, tangent: false, numerical: true });
        }
      }
    }
  }
  return found;
}

function finalize(points: readonly Intersection[], tol: number): Intersection[] {
  const unique: Intersection[] = [];
  const merge = Math.max(tol, 1e-7);
  for (const p of points) {
    if (abs(p.gamma) > 1 + 1e-9) continue;
    if (!unique.some((u) => abs(sub(u.gamma, p.gamma)) <= merge)) unique.push(p);
  }
  return unique.sort((x, y) => x.gamma.re - y.gamma.re || y.gamma.im - x.gamma.im);
}

export function intersectCurves(a: Curve, b: Curve, tolerance = INTERSECTION_TOLERANCE): IntersectionResult {
  if (a.shape && b.shape) return shapeShape(a.shape, b.shape, tolerance);
  let points: Intersection[];
  if (a.shape) points = parametricShape(b, a.shape);
  else if (b.shape) points = parametricShape(a, b.shape);
  else points = parametricParametric(a, b);
  return { points: finalize(points, tolerance), coincident: false, closestApproach: null };
}
