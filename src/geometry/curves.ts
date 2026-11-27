/**
 * Curves in the Γ-plane (independent of rendering).
 *
 * A curve is defined mathematically by `point(t)` over a finite, named
 * parameter interval. When the curve is a known circle, arc or line segment
 * its exact `shape` is also provided; renderers and intersection routines
 * use the exact shape whenever it exists and fall back to sampling
 * `point(t)` otherwise.
 */
import {
  type Complex,
  abs,
  arg,
  complex,
  fromPolar,
  reflectionFromImpedance,
  reflectionThroughLine,
} from '../core';
import { wavelengthsTowardGenerator, wavelengthsTowardLoad } from './wavelength-scale';
import { reactanceCurve, resistanceCurve } from './impedance-circles';
import { type Shape, rotatePoint, rotateShape, unitPhasor } from './shapes';
import { lineTransformationArc } from './transmission-line-paths';
import { reflectionMagnitudeCircle } from './vswr-circles';

export type CurveKind =
  | 'vswrCircle'
  | 'resistanceCircle'
  | 'reactanceCircle'
  | 'conductanceCircle'
  | 'susceptanceCircle'
  | 'linePath'
  | 'radialGuide'
  | 'parametric';

/** What the parameter of `point(t)` means, for inspection. */
export interface CurveParameter {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  /** Display unit, e.g. 'λ'. */
  readonly unit: string;
}

export interface CurveProperty {
  readonly label: string;
  readonly value: string;
}

/**
 * How a curve's coordinates are interpreted (see `chart-mode.ts`):
 *   number  the curve is a set of z/y/Z *numbers*; its geometry is stored
 *           canonically as C_Z(w) = (w − 1)/(w + 1) and is drawn on the
 *           active coordinate grid (flipped in admittance mode);
 *   plane   the curve is a set of physical Γ positions, fixed in all modes.
 */
export type CurveFrame = 'number' | 'plane';
export type CurveDomain = 'impedance' | 'admittance';

export interface Curve {
  readonly kind: CurveKind;
  readonly frame: CurveFrame;
  /** Number curves: whether the numbers are impedances or admittances. */
  readonly domain: CurveDomain | null;
  /** Radial guides: the point the guide passes through (canonical coordinates). */
  readonly anchor: Complex | null;
  /** Human-readable construction, e.g. "constant-r circle". */
  readonly label: string;
  /** Defining parameters for inspection. */
  readonly properties: readonly CurveProperty[];
  /** Exact geometry when the curve is a circle, arc or segment; null for general curves. */
  readonly shape: Shape | null;
  readonly parameter: CurveParameter;
  /** Γ at parameter t, or null where the curve is undefined (singularity). */
  readonly point: (t: number) => Complex | null;
}

const fmt = (v: number) => String(Number(v.toPrecision(6)));

/** Default inspection range for parameters that are really unbounded (reactance, resistance). */
export const UNBOUNDED_PARAMETER_LIMIT = 10;

export function vswrCircleCurve(radius: number, vswr: number): Curve {
  if (!(radius >= 0 && radius <= 1)) throw new RangeError(`A constant-VSWR circle needs 0 ≤ |Γ| ≤ 1 (got ${radius})`);
  return {
    kind: 'vswrCircle',
    frame: 'plane',
    domain: null,
    anchor: null,
    label: 'constant-VSWR circle',
    properties: [
      { label: 'VSWR', value: Number.isFinite(vswr) ? fmt(vswr) : '∞' },
      { label: '|Γ|', value: fmt(radius) },
    ],
    shape: radius > 0 ? reflectionMagnitudeCircle(radius) : null,
    // Parameterised by the wavelengths-toward-generator reading (0 at the short-circuit side).
    parameter: { name: 'WTG', min: 0, max: 0.5, unit: 'λ' },
    point: (t) => fromPolar(radius, Math.PI - 4 * Math.PI * t),
  };
}

export function resistanceCircleCurve(r: number): Curve {
  if (!(r >= 0) || !Number.isFinite(r)) throw new RangeError(`A constant-r circle needs a finite r ≥ 0 (got ${r})`);
  return {
    kind: 'resistanceCircle',
    frame: 'number',
    domain: 'impedance',
    anchor: null,
    label: 'constant-resistance circle',
    properties: [{ label: 'r', value: fmt(r) }],
    shape: resistanceCurve(r),
    parameter: { name: 'x', min: -UNBOUNDED_PARAMETER_LIMIT, max: UNBOUNDED_PARAMETER_LIMIT, unit: '' },
    point: (x) => reflectionFromImpedance(complex(r, x)),
  };
}

export function reactanceCircleCurve(x: number): Curve {
  if (!Number.isFinite(x)) throw new RangeError(`A constant-x curve needs a finite x (got ${x})`);
  return {
    kind: 'reactanceCircle',
    frame: 'number',
    domain: 'impedance',
    anchor: null,
    label: x === 0 ? 'constant-reactance line (x = 0)' : 'constant-reactance arc',
    properties: [{ label: 'x', value: fmt(x) }],
    shape: reactanceCurve(x, 0, Infinity),
    parameter: { name: 'r', min: 0, max: UNBOUNDED_PARAMETER_LIMIT, unit: '' },
    point: (r) => (r < 0 ? null : reflectionFromImpedance(complex(r, x))),
  };
}

export function conductanceCircleCurve(g: number): Curve {
  if (!(g >= 0) || !Number.isFinite(g)) throw new RangeError(`A constant-g circle needs a finite g ≥ 0 (got ${g})`);
  // Admittance numbers g + jb, stored canonically at C_Z(g + jb): the same
  // geometry as the r = g circle. In admittance mode it is drawn flipped,
  // i.e. on the admittance grid's g circle.
  return {
    kind: 'conductanceCircle',
    frame: 'number',
    domain: 'admittance',
    anchor: null,
    label: 'constant-conductance circle',
    properties: [{ label: 'g', value: fmt(g) }],
    shape: resistanceCurve(g),
    parameter: { name: 'b', min: -UNBOUNDED_PARAMETER_LIMIT, max: UNBOUNDED_PARAMETER_LIMIT, unit: '' },
    point: (b) => reflectionFromImpedance(complex(g, b)),
  };
}

export function susceptanceCircleCurve(b: number): Curve {
  if (!Number.isFinite(b)) throw new RangeError(`A constant-b curve needs a finite b (got ${b})`);
  return {
    kind: 'susceptanceCircle',
    frame: 'number',
    domain: 'admittance',
    anchor: null,
    label: b === 0 ? 'constant-susceptance line (b = 0)' : 'constant-susceptance arc',
    properties: [{ label: 'b', value: fmt(b) }],
    shape: reactanceCurve(b, 0, Infinity),
    parameter: { name: 'g', min: 0, max: UNBOUNDED_PARAMETER_LIMIT, unit: '' },
    point: (g) => (g < 0 ? null : reflectionFromImpedance(complex(g, b))),
  };
}

/**
 * Γ(l) = Γ_L·e^(−j4πl) for l ∈ [from, to] (wavelengths toward the generator).
 * `gammaLoad` is in the curve's own coordinates: physical Γ for a plane path,
 * C_Z of the starting number for a number path (a line rotates both alike).
 */
export function linePathCurve(
  gammaLoad: Complex,
  from: number,
  to: number,
  frame: CurveFrame = 'plane',
  domain: CurveDomain | null = null,
): Curve {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(from < to)) {
    throw new RangeError(`A line path needs finite lengths with start < end (got ${from}, ${to})`);
  }
  const radius = abs(gammaLoad);
  if (!(radius <= 1)) throw new RangeError(`A line path needs a passive load, |Γ| ≤ 1 (got ${radius})`);
  const start = reflectionThroughLine(gammaLoad, from);
  const arc = lineTransformationArc(start, to - from);
  return {
    kind: 'linePath',
    frame,
    domain,
    anchor: null,
    label: 'transmission-line path',
    properties: [
      { label: '|Γ|', value: fmt(radius) },
      { label: 'l from', value: `${fmt(from)}λ` },
      { label: 'l to', value: `${fmt(to)}λ` },
    ],
    shape: arc?.shape ?? null,
    parameter: { name: 'l', min: from, max: to, unit: 'λ' },
    point: (l) => reflectionThroughLine(gammaLoad, l),
  };
}

/**
 * Radial guide: the straight line from the chart centre through Γ to the
 * unit circle, i.e. the ray of constant ∠Γ. Its segment ends exactly on the
 * boundary, so it is clipped to the disc by construction. Parameterised by
 * |Γ| along the ray, s ∈ [0, 1]. Undefined at the matched point (Γ = 0),
 * where the angle has no meaning.
 */
export function radialGuideCurve(gamma: Complex, frame: CurveFrame = 'plane', domain: CurveDomain | null = null): Curve {
  const magnitude = abs(gamma);
  if (!(magnitude > 0) || !Number.isFinite(magnitude)) {
    throw new RangeError('A radial guide needs Γ ≠ 0: the angle is undefined at the matched point');
  }
  const angle = arg(gamma);
  // Γ/|Γ| rather than e^(j∠Γ): exact on the axes and as precise as Γ itself.
  const unit = complex(gamma.re / magnitude, gamma.im / magnitude);
  const edge = unit;
  const wtg = wavelengthsTowardGenerator(gamma);
  const wtl = wavelengthsTowardLoad(gamma);
  return {
    kind: 'radialGuide',
    frame,
    domain,
    anchor: gamma,
    label: 'radial guide',
    properties: [
      { label: '∠Γ', value: `${fmt((angle * 180) / Math.PI)}°` },
      { label: '|Γ| at source', value: fmt(magnitude) },
      { label: 'WTG', value: wtg === null ? '—' : `${fmt(wtg)}λ` },
      { label: 'WTL', value: wtl === null ? '—' : `${fmt(wtl)}λ` },
    ],
    shape: { kind: 'segment', start: complex(0, 0), end: edge },
    parameter: { name: '|Γ|', min: 0, max: 1, unit: '' },
    point: (s) => (s < 0 || s > 1 ? null : complex(unit.re * s, unit.im * s)),
  };
}

/** A general parametric curve Γ(t), t ∈ [t0, t1]. */
export function parametricCurve(
  point: (t: number) => Complex | null,
  parameterName: string,
  t0: number,
  t1: number,
  properties: readonly CurveProperty[] = [],
  frame: CurveFrame = 'plane',
  domain: CurveDomain | null = null,
): Curve {
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || !(t0 < t1)) {
    throw new RangeError(`A parametric curve needs a finite interval with start < end (got ${t0}, ${t1})`);
  }
  return {
    kind: 'parametric',
    frame,
    domain,
    anchor: null,
    label: 'parametric curve',
    properties: [{ label: parameterName, value: `${fmt(t0)} … ${fmt(t1)}` }, ...properties],
    shape: null,
    parameter: { name: parameterName, min: t0, max: t1, unit: '' },
    point,
  };
}

/**
 * Rotate a curve about Γ = 0 by θ radians: Γ_rot(t) = Γ(t)·e^(jθ).
 *
 * Exact shapes stay exact (circle centres, arc endpoints and start angle
 * rotate; radius, sweep and direction of travel are unchanged). The
 * parameter name, range and direction are unchanged, so the rotated curve's
 * point(t) is the original point(t) rotated. Frame and domain are kept.
 * Rotation preserves |Γ|, so a curve inside the unit disc stays inside.
 *
 * With `annotate` (the default, used by the `rotate()` expression) the label
 * and properties record the rotation. The chart-mode flip uses
 * `annotate: false`, because it is a change of view, not of the curve.
 */
export function rotateCurve(curve: Curve, theta: number, options: { annotate?: boolean } = {}): Curve {
  const annotate = options.annotate ?? true;
  const phasor = unitPhasor(theta);
  const shape = curve.shape ? rotateShape(curve.shape, theta) : null;
  const point = (t: number): Complex | null => {
    const p = curve.point(t);
    return p ? rotatePoint(p, phasor) : null;
  };
  const anchor = curve.anchor ? rotatePoint(curve.anchor, phasor) : null;
  // A radial guide's readings depend on its angle: recompute them.
  const properties =
    curve.kind === 'radialGuide' && anchor ? radialGuideCurve(anchor).properties : curve.properties;
  const deg = (theta * 180) / Math.PI;
  return {
    ...curve,
    label: annotate ? `${curve.label}, rotated` : curve.label,
    properties: annotate ? [...properties, { label: 'rotation', value: `${fmt(theta)} rad (${fmt(deg)}°)` }] : properties,
    shape,
    point,
    anchor,
  };
}
