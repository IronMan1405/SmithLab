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
 *   seriesPath(x, e0, e1)    exact locus of series(x, e) as e sweeps e0 → e1
 *   shuntPath(x, e0, e1)     exact locus of shunt(x, e) as e sweeps e0 → e1
 *   intersect(c1, c2[, k])   k-th intersection (default 1), as a Γ point
 *   at(c, t)                 point of curve c at parameter t, as a Γ point
 */
import { type Complex, abs, complex, isFiniteComplex, normalizeImpedance, scale, sub, impedanceFromReflection, reflectionMagnitudeFromVswr, vswrFromReflection } from '../core';
import {
  type Curve,
  conductanceCircleCurve,
  elementSweepCurve,
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
import { type FunctionContext, canonicalPosition, frameOfType, toReflection } from './functions';
import { type ElementDomain, assertChartPoint, elementIn, elementRelation, pointIn } from './elements';
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

const fmt = (v: number) => String(Number(v.toPrecision(6)));

/**
 * seriesPath / shuntPath: the exact locus of series(x, e) / shunt(x, e) as
 * the element e moves along the straight segment e0 → e1 of its *own*
 * represented value (a plain number, z, y or Z in Ω).
 *
 * The parameter is that own value: its imaginary part (x, b, or X in Ω)
 * when e0 and e1 differ only in it, its real part (r, g, R) when they differ
 * only in that, otherwise s ∈ [0, 1] along e0 → e1. For a cross-domain
 * element (a y in series, a z or Z in shunt) the operation adds 1/e, so the
 * parameter is *not* the impedance/admittance actually added.
 *
 * Only the part of the sweep with Re ≥ 0 in the operation's domain is drawn
 * (|Γ| ≤ 1); at() rejects parameter values outside it.
 */
function elementSweep(operation: 'series' | 'shunt'): CurveFunctionSpec {
  const domain: ElementDomain = operation === 'series' ? 'impedance' : 'admittance';
  const domainSymbol = domain === 'impedance' ? 'z' : 'y';
  return {
    arity: [2, 3],
    signature: '(x, e1) or (x, e0, e1)',
    description:
      operation === 'series'
        ? "exact path of series(x, e) as e sweeps e0 → e1 (e0 defaults to z = 0). The parameter is e's own value; for a y element the series impedance added is 1/e"
        : "exact path of shunt(x, e) as e sweeps e0 → e1 (e0 defaults to y = 0). The parameter is e's own value; for a z or Z element the shunt admittance added is 1/e",
    apply: (args, ctx, name) => {
      const x = scalar(name, args[0]!);
      assertChartPoint(x, name);
      const e1 = scalar(name, args[args.length - 1]!);
      let e0: TypedValue;
      if (args.length === 3) {
        e0 = scalar(name, args[1]!);
        const bothPlain = isPlainType(e0.type) && isPlainType(e1.type);
        if (!bothPlain && e0.type !== e1.type) {
          throw new TypeMismatch(
            `${name}() needs both element values of the same type (got ${withArticle(label(e0))} and ${withArticle(label(e1))})`,
          );
        }
      } else {
        // The default start is zero *in the operation's own domain*: it must
        // be expressible as a value of e1's type without becoming singular.
        if (elementRelation(domain, e1) === 'cross') {
          throw new TypeMismatch(
            `${name}(x, e1) starts from ${domainSymbol} = 0, which is not ${withArticle(label(e1))} value ` +
              `(it would be infinite). Give the start explicitly: ${name}(x, e0, e1) with e0 of the same type`,
          );
        }
        e0 = { type: e1.type, value: complex(0, 0) };
      }
      // Validates element types (rejects Γ, λ, ambiguous plain-on-Ω) and records Z₀ use.
      elementIn(domain, e0, x, ctx, name);
      elementIn(domain, e1, x, ctx, name);
      const cross = elementRelation(domain, e1) === 'cross';

      // Own represented values (in their own units) and their normalised forms q.
      const v0 = e0.value;
      const v1 = e1.value;
      if (v0.re === v1.re && v0.im === v1.im) {
        throw new TypeMismatch(`${name}() needs two different element values (the sweep has zero width)`);
      }
      const ohms = e1.type === 'physicalImpedance';
      const normalise = (v: Complex): Complex => {
        if (ohms) return normalizeImpedance(v, ctx.z0);
        return cross ? v : elementIn(domain, { type: e1.type, value: v }, x, ctx, name);
      };
      const q0 = normalise(v0);
      const q1 = normalise(v1);
      if (!isFiniteComplex(q0) || !isFiniteComplex(q1)) throw new TypeMismatch(`${name}() element values must be finite`);

      // Parameter naming from the element's own type.
      const ownDomain: ElementDomain =
        isPlainType(e1.type) ? domain : e1.type === 'admittance' ? 'admittance' : 'impedance';
      let t0: number;
      let t1: number;
      let pname: string;
      if (v0.re === v1.re) {
        [t0, t1] = [v0.im, v1.im];
        pname = ohms ? 'X' : ownDomain === 'impedance' ? 'x' : 'b';
      } else if (v0.im === v1.im) {
        [t0, t1] = [v0.re, v1.re];
        pname = ohms ? 'R' : ownDomain === 'impedance' ? 'r' : 'g';
      } else {
        [t0, t1] = [0, 1];
        pname = 's';
      }
      const unit = ohms && pname !== 's' ? 'Ω' : '';
      const beta = scale(sub(q1, q0), 1 / (t1 - t0));
      const alpha = sub(q0, scale(beta, t0));

      const w = pointIn(domain, x, ctx);
      if (!isFiniteComplex(w)) {
        throw new TypeMismatch(
          operation === 'series'
            ? `${name}(): a series element cannot change an open circuit (z = ∞)`
            : `${name}(): a shunt element cannot change a short circuit (y = ∞)`,
        );
      }
      // κ = σ·C_Z(u): the point's frame number is u itself (σ = +1) or its reciprocal (σ = −1).
      const sameFrame = domain === 'impedance' ? x.type !== 'admittance' : x.type === 'admittance';
      const { frame, domain: curveDomain } = frameOfType(x.type);
      try {
        return curve(
          elementSweepCurve({
            operation,
            w,
            sigma: sameFrame ? 1 : -1,
            cross,
            alpha,
            beta,
            t0,
            t1,
            parameterName: pname,
            parameterUnit: unit,
            frame,
            domain: curveDomain,
            properties: [
              { label: 'element', value: `${TYPE_INFO_LABEL(e1)}${cross ? ' (adds 1/e)' : ''}` },
              { label: 'e from', value: fmtComplex(v0) + (ohms ? ' Ω' : '') },
              { label: 'e to', value: fmtComplex(v1) + (ohms ? ' Ω' : '') },
              { label: 'parameter', value: pname === 's' ? 's ∈ 0 … 1' : `${pname} (${unit || 'normalized'})` },
            ],
          }),
        );
      } catch (err) {
        if (err instanceof RangeError) throw new TypeMismatch(`${name}(): ${err.message}`);
        throw err;
      }
    },
  };
}

const isPlainType = (t: TypedValue['type']) => t === 'real' || t === 'complex';
const TYPE_INFO_LABEL = (e: TypedValue) => (isPlainType(e.type) ? 'plain number' : TYPE_INFO[e.type].symbol);
function fmtComplex(v: Complex): string {
  if (v.im === 0) return fmt(v.re);
  const im = `j${fmt(Math.abs(v.im))}`;
  if (v.re === 0) return v.im < 0 ? `-${im}` : im;
  return `${fmt(v.re)} ${v.im < 0 ? '-' : '+'} ${im}`;
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
  seriesPath: elementSweep('series'),
  shuntPath: elementSweep('shunt'),
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
      if (cv.passive && !cv.passive.some(([a, b]) => tt >= a && tt <= b)) {
        const unit = cv.parameter.unit;
        const ranges = cv.passive.map(([a, b]) => `${fmt(a)}${unit} … ${fmt(b)}${unit}`).join(' or ');
        throw new TypeMismatch(
          `${cv.parameter.name} = ${fmt(tt)}${unit} is outside the drawn sweep on the passive chart (${ranges})`,
        );
      }
      const p = cv.point(tt);
      if (!p || !Number.isFinite(p.re) || !Number.isFinite(p.im)) {
        throw new TypeMismatch(`The curve is undefined at ${cv.parameter.name} = ${tt}`);
      }
      return pointValue(complex(p.re, p.im), cv.frame, cv.domain);
    },
  },
};
