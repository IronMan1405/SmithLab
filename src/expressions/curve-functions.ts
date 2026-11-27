/**
 * Curve constructions and curve queries available in expressions.
 * Each function validates its arguments and delegates the mathematics to
 * `src/geometry/curves.ts` and `src/geometry/intersections.ts`.
 *
 *   vswrCircle(s | x)        constant-|Γ| circle: s a real VSWR ≥ 1, or any z/y/Γ/Z
 *   rCircle(r | z)           constant-resistance circle
 *   xCircle(x | z)           constant-reactance arc (x = 0: real axis)
 *   gCircle(g | y)           constant-conductance circle
 *   bCircle(b | y)           constant-susceptance arc
 *   linePath(x, l)           line path from x over [0, l] wavelengths
 *   linePath(x, l0, l1)      line path over [l0, l1]
 *   radial(x)                radial guide from the centre through a z/y/Γ/Z point
 *   rotate(c, θ)             curve c rotated about Γ = 0 by θ radians (exact)
 *   intersect(c1, c2[, k])   k-th intersection (default 1), as a Γ point
 *   at(c, t)                 point of curve c at parameter t, as a Γ point
 */
import { type Complex, abs, complex, impedanceFromReflection, reflectionMagnitudeFromVswr, vswrFromReflection } from '../core';
import {
  type Curve,
  conductanceCircleCurve,
  intersectCurves,
  intersectionFrame,
  linePathCurve,
  radialGuideCurve,
  reactanceCircleCurve,
  resistanceCircleCurve,
  rotateCurve,
  susceptanceCircleCurve,
  vswrCircleCurve,
} from '../geometry';
import { type FunctionContext, canonicalPosition, toReflection } from './functions';
import { type TypedValue, type Value, TYPE_INFO, TypeMismatch, isCurve, withArticle } from './types';

export interface CurveFunctionSpec {
  readonly arity: readonly number[];
  readonly signature: string;
  readonly description: string;
  readonly apply: (args: readonly Value[], ctx: FunctionContext, name: string) => Value;
}

const label = (v: Value) => (isCurve(v) ? 'curve' : TYPE_INFO[v.type].label);

function scalar(name: string, v: Value): TypedValue {
  if (isCurve(v)) throw new TypeMismatch(`${name}() expects a number here, not a curve`);
  return v;
}

function realNumber(name: string, v: Value, what: string): number {
  const s = scalar(name, v);
  if (s.type !== 'real' && s.type !== 'length') throw new TypeMismatch(`${name}() needs a real ${what}, not ${withArticle(label(v))}`);
  return s.value.re;
}

function curveArg(name: string, v: Value): Curve {
  if (!isCurve(v)) throw new TypeMismatch(`${name}() expects a curve, not ${withArticle(label(v))}`);
  return v.curve;
}

/** A real argument, or the real/imaginary part of a value of the allowed type. */
function partOf(name: string, v: Value, allowed: TypedValue['type'], part: 're' | 'im', what: string): number {
  const s = scalar(name, v);
  if (s.type === 'real') return s.value.re;
  if (s.type === allowed) return s.value[part];
  throw new TypeMismatch(`${name}() needs a real ${what} or ${withArticle(TYPE_INFO[allowed].label)}, not ${withArticle(label(v))}`);
}

const curve = (c: Curve): Value => ({ type: 'curve', curve: c });

/**
 * The value at canonical position κ of a curve frame: a Γ for plane curves,
 * the number C_Z⁻¹(κ) typed by the curve's domain for number curves.
 */
function pointValue(position: Complex, frame: Curve['frame'], domain: Curve['domain']): Value {
  if (frame === 'plane') return { type: 'reflection', value: position };
  const w = impedanceFromReflection(position);
  return { type: domain === 'admittance' ? 'admittance' : 'impedance', value: w };
}

export const CURVE_FUNCTIONS: Readonly<Record<string, CurveFunctionSpec>> = {
  vswrCircle: {
    arity: [1],
    signature: '(s)',
    description: 'constant-VSWR circle for a VSWR s ≥ 1, or through a z/y/Γ/Z point',
    apply: ([v], ctx, name) => {
      const s = scalar(name, v!);
      if (s.type === 'real') {
        if (!(s.value.re >= 1)) throw new TypeMismatch(`${name}() needs VSWR ≥ 1 (got ${s.value.re})`);
        return curve(vswrCircleCurve(reflectionMagnitudeFromVswr(s.value.re), s.value.re));
      }
      const gamma = toReflection(s, ctx, name);
      const radius = abs(gamma);
      if (radius > 1) throw new TypeMismatch(`${name}() needs a passive point, |Γ| ≤ 1 (got ${radius.toPrecision(4)})`);
      return curve(vswrCircleCurve(radius, vswrFromReflection(gamma)));
    },
  },
  rCircle: {
    arity: [1],
    signature: '(r)',
    description: 'constant-resistance circle (r real, or Re of an impedance)',
    apply: ([v], _ctx, name) => curve(resistanceCircleCurve(partOf(name, v!, 'impedance', 're', 'resistance'))),
  },
  xCircle: {
    arity: [1],
    signature: '(x)',
    description: 'constant-reactance arc (x real, or Im of an impedance)',
    apply: ([v], _ctx, name) => curve(reactanceCircleCurve(partOf(name, v!, 'impedance', 'im', 'reactance'))),
  },
  gCircle: {
    arity: [1],
    signature: '(g)',
    description: 'constant-conductance circle (g real, or Re of an admittance)',
    apply: ([v], _ctx, name) => curve(conductanceCircleCurve(partOf(name, v!, 'admittance', 're', 'conductance'))),
  },
  bCircle: {
    arity: [1],
    signature: '(b)',
    description: 'constant-susceptance arc (b real, or Im of an admittance)',
    apply: ([v], _ctx, name) => curve(susceptanceCircleCurve(partOf(name, v!, 'admittance', 'im', 'susceptance'))),
  },
  linePath: {
    arity: [2, 3],
    signature: '(x, l) or (x, l0, l1)',
    description: 'path of Γ along a lossless line, toward the generator',
    apply: (args, ctx, name) => {
      const { position, frame, domain } = canonicalPosition(scalar(name, args[0]!), ctx, name);
      const from = args.length === 3 ? realNumber(name, args[1]!, 'length') : 0;
      const to = realNumber(name, args[args.length - 1]!, 'length');
      if (!(from < to)) throw new TypeMismatch(`${name}() needs a non-empty length range (got ${from} to ${to})`);
      if (abs(position) > 1) throw new TypeMismatch(`${name}() needs a passive point, |Γ| ≤ 1`);
      // A line rotates C_Z(number) exactly as it rotates Γ, so one construction serves both frames.
      return curve(linePathCurve(position, from, to, frame, domain));
    },
  },
  radial: {
    arity: [1],
    signature: '(x)',
    description: 'radial guide from the chart centre through a point to the boundary',
    apply: ([v], ctx, name) => {
      const { position, frame, domain } = canonicalPosition(scalar(name, v!), ctx, name);
      if (abs(position) > 1) throw new TypeMismatch(`${name}() needs a point on the chart, |Γ| ≤ 1`);
      return curve(radialGuideCurve(position, frame, domain));
    },
  },
  rotate: {
    arity: [2],
    signature: '(c, θ)',
    description: 'curve c rotated about Γ = 0 by θ radians (exact). Along a line of l wavelengths: rotate(c, -4*pi*l)',
    apply: ([c, t], _ctx, name) => {
      const cv = curveArg(name, c!);
      const theta = scalar(name, t!);
      if (theta.type === 'length') {
        throw new TypeMismatch(`${name}() takes an angle in radians, not a length; for a line of l wavelengths use ${name}(c, -4*pi*l)`);
      }
      if (theta.type !== 'real') throw new TypeMismatch(`${name}() angle must be a real number of radians, not ${withArticle(label(t!))}`);
      return curve(rotateCurve(cv, theta.value.re));
    },
  },
  intersect: {
    arity: [2, 3],
    signature: '(c1, c2) or (c1, c2, k)',
    description:
      'k-th intersection of two curves (ordered by increasing Re Γ): a z or y point for impedance/admittance curves, a Γ point for Γ curves',
    apply: (args, _ctx, name) => {
      const a = curveArg(name, args[0]!);
      const b = curveArg(name, args[1]!);
      const k = args.length === 3 ? realNumber(name, args[2]!, 'index') : 1;
      if (!Number.isInteger(k) || k < 1) throw new TypeMismatch(`${name}() index must be a whole number ≥ 1 (got ${k})`);
      const frame = intersectionFrame(a, b);
      if (!frame.ok) throw new TypeMismatch(frame.reason);
      // Computed in canonical coordinates, so the result is the same in every chart mode.
      const result = intersectCurves(a, b);
      if (result.coincident) throw new TypeMismatch('The curves coincide: they share infinitely many points');
      if (result.points.length === 0) {
        const gap = result.closestApproach;
        throw new TypeMismatch(
          `The curves do not intersect${gap !== null ? ` (closest approach ${gap.toPrecision(3)} in Γ)` : ''}`,
        );
      }
      const hit = result.points[k - 1];
      if (!hit) {
        throw new TypeMismatch(`Only ${result.points.length} intersection${result.points.length === 1 ? '' : 's'} (asked for #${k})`);
      }
      return pointValue(hit.gamma, frame.frame, frame.domain);
    },
  },
  at: {
    arity: [2],
    signature: '(c, t)',
    description: 'point of curve c at parameter t: a z or y point for impedance/admittance curves, a Γ point for Γ curves',
    apply: ([c, t], _ctx, name) => {
      const cv = curveArg(name, c!);
      const tt = realNumber(name, t!, 'parameter');
      const p = cv.point(tt);
      if (!p || !Number.isFinite(p.re) || !Number.isFinite(p.im)) {
        throw new TypeMismatch(`The curve is undefined at ${cv.parameter.name} = ${tt}`);
      }
      return pointValue(complex(p.re, p.im), cv.frame, cv.domain);
    },
  },
};
