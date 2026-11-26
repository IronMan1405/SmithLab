/**
 * Curve → SVG path data, with caching. Pure (no React).
 *
 * - Curves with an exact shape use true SVG arcs (exact at any zoom).
 * - General curves are sampled adaptively with a tolerance of a fraction of
 *   a screen pixel. Tolerances are quantised to powers of two so panning
 *   (and small zoom changes) reuse cached samples; results are cached per
 *   curve object, so a curve whose expression was not re-evaluated is never
 *   resampled.
 */
import { CHART_RADIUS, type Curve, type Polyline, gammaToSvg, sampleCurve } from '../geometry';
import { shapeToPath } from './svg-path';

/** Maximum chord deviation in screen pixels. */
export const CURVE_PIXEL_TOLERANCE = 0.35;

const cache = new WeakMap<Curve, Map<number, string>>();

/** Γ-plane tolerance bucket (power of two) for the given SVG-units-per-pixel. */
export function toleranceBucket(unitsPerPixel: number): number {
  const gammaPerPixel = unitsPerPixel / CHART_RADIUS;
  const tol = Math.max(1e-7, CURVE_PIXEL_TOLERANCE * gammaPerPixel);
  return 2 ** Math.floor(Math.log2(tol));
}

function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

export function polylinesToPath(polylines: readonly Polyline[]): string {
  return polylines
    .map((line) =>
      line
        .map((s, i) => {
          const p = gammaToSvg(s.p);
          return `${i === 0 ? 'M' : 'L'} ${n(p.x)} ${n(p.y)}`;
        })
        .join(' '),
    )
    .join(' ');
}

export function curvePath(curve: Curve, unitsPerPixel: number): string {
  if (curve.shape) return shapeToPath(curve.shape);
  const bucket = toleranceBucket(unitsPerPixel);
  let byTolerance = cache.get(curve);
  if (!byTolerance) {
    byTolerance = new Map();
    cache.set(curve, byTolerance);
  }
  const hit = byTolerance.get(bucket);
  if (hit !== undefined) return hit;
  const { polylines } = sampleCurve(curve.point, curve.parameter.min, curve.parameter.max, { tolerance: bucket });
  const path = polylinesToPath(polylines);
  byTolerance.set(bucket, path);
  return path;
}
