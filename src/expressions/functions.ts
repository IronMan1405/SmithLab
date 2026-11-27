/**
 * Built-in functions. Each entry validates its argument types and computes
 * with the core engine. New domain functions (series/shunt elements, stubs,
 * frequency-dependent models…) are added here without touching the parser
 * or evaluator.
 */
import {
  type Complex,
  abs,
  add,
  admittanceFromImpedance,
  admittanceFromReflection,
  arg,
  complex,
  conj,
  denormalizeImpedance,
  div,
  impedanceFromAdmittance,
  impedanceFromReflection,
  normalizeImpedance,
  reflectionFromAdmittance,
  reflectionFromImpedance,
  reflectionThroughLine,
  returnLossDb,
  scale,
  vswrFromReflection,
} from '../core';
import { type TypedValue, type ValueType, TYPE_INFO, TypeMismatch, isPlain, plainType, withArticle } from './types';

export interface FunctionContext {
  /** Workspace reference impedance in ohms. */
  readonly z0: number;
  /** Called whenever a function's result depends on Z₀. */
  readonly noteZ0: () => void;
}

export interface FunctionSpec {
  /** Accepted argument counts. */
  readonly arity: readonly number[];
  readonly signature: string;
  readonly description: string;
  readonly apply: (args: readonly TypedValue[], ctx: FunctionContext, name: string) => TypedValue;
}

const label = (t: ValueType) => TYPE_INFO[t].label;
const real = (x: number): TypedValue => ({ type: 'real', value: complex(x, 0) });

function plainArg(name: string, v: TypedValue): Complex {
  if (!isPlain(v.type)) throw new TypeMismatch(`${name}() expects a plain number, not ${withArticle(label(v.type))}`);
  return v.value;
}

/** Plain-number function evaluated in the complex plane. */
function plainFn(fn: (c: Complex) => Complex, description: string): FunctionSpec {
  return {
    arity: [1],
    signature: '(x)',
    description,
    apply: ([x], _ctx, name) => {
      const value = fn(plainArg(name, x!));
      return { type: plainType(value, x!.type === 'real'), value };
    },
  };
}

function cexp(c: Complex): Complex {
  const m = Math.exp(c.re);
  return complex(m * Math.cos(c.im), m * Math.sin(c.im));
}
function clog(c: Complex): Complex {
  return complex(Math.log(abs(c)), arg(c));
}
function csqrt(c: Complex): Complex {
  if (c.im === 0 && c.re >= 0) return complex(Math.sqrt(c.re), 0);
  const r = abs(c);
  const re = Math.sqrt((r + c.re) / 2);
  const im = Math.sign(c.im || 1) * Math.sqrt((r - c.re) / 2);
  return complex(re, im);
}
function csin(c: Complex): Complex {
  return complex(Math.sin(c.re) * Math.cosh(c.im), Math.cos(c.re) * Math.sinh(c.im));
}
function ccos(c: Complex): Complex {
  return complex(Math.cos(c.re) * Math.cosh(c.im), -Math.sin(c.re) * Math.sinh(c.im));
}

/** Γ of any value that has a position on the chart. */
export function toReflection(v: TypedValue, ctx: FunctionContext, name: string): Complex {
  switch (v.type) {
    case 'reflection':
      return v.value;
    case 'impedance':
      return reflectionFromImpedance(v.value);
    case 'admittance':
      return reflectionFromAdmittance(v.value);
    case 'physicalImpedance':
      ctx.noteZ0();
      return reflectionFromImpedance(scale(v.value, 1 / ctx.z0));
    default:
      throw new TypeMismatch(`${name}() needs an impedance, admittance or reflection coefficient, not ${withArticle(label(v.type))}`);
  }
}

/** Chart frame of a chart-typed value: z/y/Z are numbers, Γ is a plane position. */
export function frameOfType(type: ValueType): { frame: 'number' | 'plane'; domain: 'impedance' | 'admittance' | null } {
  if (type === 'reflection') return { frame: 'plane', domain: null };
  return { frame: 'number', domain: type === 'admittance' ? 'admittance' : 'impedance' };
}

/**
 * Canonical chart coordinates of a value (see geometry/chart-mode.ts):
 * z, y and Z values are numbers, placed canonically at C_Z(number) — for y
 * that is the *number* y, not the load's physical Γ; Γ values are physical
 * plane positions.
 */
export function canonicalPosition(
  v: TypedValue,
  ctx: FunctionContext,
  name: string,
): { position: Complex; frame: 'number' | 'plane'; domain: 'impedance' | 'admittance' | null } {
  switch (v.type) {
    case 'reflection':
      return { position: v.value, frame: 'plane', domain: null };
    case 'impedance':
      return { position: reflectionFromImpedance(v.value), frame: 'number', domain: 'impedance' };
    case 'admittance':
      return { position: reflectionFromImpedance(v.value), frame: 'number', domain: 'admittance' };
    case 'physicalImpedance':
      ctx.noteZ0();
      return { position: reflectionFromImpedance(normalizeImpedance(v.value, ctx.z0)), frame: 'number', domain: 'impedance' };
    default:
      throw new TypeMismatch(`${name}() needs an impedance, admittance or reflection coefficient, not ${withArticle(label(v.type))}`);
  }
}

/** Convert Γ back to the given chart type. */
function fromReflection(gamma: Complex, type: ValueType, ctx: FunctionContext): Complex {
  switch (type) {
    case 'impedance':
      return impedanceFromReflection(gamma);
    case 'admittance':
      return admittanceFromReflection(gamma);
    case 'physicalImpedance':
      ctx.noteZ0();
      return scale(impedanceFromReflection(gamma), ctx.z0);
    default:
      return gamma;
  }
}

/** Conversion / declaration function for a chart type. */
function converter(target: 'impedance' | 'admittance' | 'reflection' | 'physicalImpedance', description: string): FunctionSpec {
  return {
    arity: [1],
    signature: '(x)',
    description,
    apply: ([x], ctx, name) => {
      if (x!.type === target) return x!;
      if (isPlain(x!.type)) return { type: target, value: x!.value }; // declare
      if (x!.type === 'length') throw new TypeMismatch(`${name}() cannot convert an electrical length`);
      // Direct reciprocal for z ↔ y keeps full precision.
      if (target === 'admittance' && x!.type === 'impedance') return { type: target, value: admittanceFromImpedance(x!.value) };
      if (target === 'impedance' && x!.type === 'admittance') return { type: target, value: impedanceFromAdmittance(x!.value) };
      return { type: target, value: fromReflection(toReflection(x!, ctx, name), target, ctx) };
    },
  };
}

// ---------------------------------------------------------------------------
// Series and shunt elements
// ---------------------------------------------------------------------------

type ElementDomain = 'impedance' | 'admittance';

/** Normalised z or y of a chart point, using the core conversions directly. */
function pointIn(domain: ElementDomain, x: TypedValue, ctx: FunctionContext): Complex {
  let z: Complex;
  switch (x.type) {
    case 'impedance':
      z = x.value;
      break;
    case 'admittance':
      return domain === 'admittance' ? x.value : impedanceFromAdmittance(x.value);
    case 'reflection':
      return domain === 'impedance' ? impedanceFromReflection(x.value) : admittanceFromReflection(x.value);
    case 'physicalImpedance':
      ctx.noteZ0();
      z = normalizeImpedance(x.value, ctx.z0);
      break;
    default:
      throw new TypeMismatch(`unreachable: ${x.type}`);
  }
  return domain === 'impedance' ? z : admittanceFromImpedance(z);
}

/** Convert a normalised z or y back into the type of the original point. */
function pointOut(domain: ElementDomain, v: Complex, type: ValueType, ctx: FunctionContext): Complex {
  const z = domain === 'impedance' ? v : impedanceFromAdmittance(v);
  switch (type) {
    case 'impedance':
      return z;
    case 'admittance':
      return domain === 'admittance' ? v : admittanceFromImpedance(v);
    case 'reflection':
      return domain === 'impedance' ? reflectionFromImpedance(v) : reflectionFromAdmittance(v);
    case 'physicalImpedance':
      ctx.noteZ0();
      return denormalizeImpedance(z, ctx.z0);
    default:
      throw new TypeMismatch(`unreachable: ${type}`);
  }
}

/**
 * Element value in the operation's domain (normalised).
 *   plain number      → already in the domain (normalised x for series, b for shunt)
 *   z / y             → converted to the domain (1/· across domains)
 *   Z (Ω)             → normalised by Z₀, then converted
 * A plain number next to a physical-impedance point is ambiguous (ohms or
 * normalised?) and rejected, consistent with `ZL + j10` being an error.
 */
function elementIn(domain: ElementDomain, e: TypedValue, x: TypedValue, ctx: FunctionContext, name: string): Complex {
  if (isPlain(e.type)) {
    if (x.type === 'physicalImpedance') {
      throw new TypeMismatch(
        `${name}(): the point is in ohms but the element is a plain number, which is ambiguous. ` +
          `Write Z(…) for an element in ohms or z(…) for a normalized one`,
      );
    }
    return e.value;
  }
  switch (e.type) {
    case 'impedance':
      return domain === 'impedance' ? e.value : admittanceFromImpedance(e.value);
    case 'admittance':
      return domain === 'admittance' ? e.value : impedanceFromAdmittance(e.value);
    case 'physicalImpedance': {
      ctx.noteZ0();
      const z = normalizeImpedance(e.value, ctx.z0);
      return domain === 'impedance' ? z : admittanceFromImpedance(z);
    }
    default:
      throw new TypeMismatch(
        `${name}() element must be an impedance, admittance or plain number, not ${withArticle(label(e.type))}`,
      );
  }
}

/**
 * series(x, e): z_out = z(x) + e   ·   shunt(x, e): y_out = y(x) + e.
 * The result has the type of x (z, y, Γ or Z), like line().
 */
function elementOperation(domain: ElementDomain, description: string): FunctionSpec {
  return {
    arity: [2],
    signature: '(x, e)',
    description,
    apply: ([x, e], ctx, name) => {
      if (!TYPE_INFO[x!.type].plottable) {
        throw new TypeMismatch(
          isPlain(x!.type)
            ? `${name}() needs a point with an RF meaning; wrap the number in z(…), y(…), gamma(…) or Z(…)`
            : `${name}() needs an impedance, admittance or reflection coefficient, not ${withArticle(label(x!.type))}`,
        );
      }
      const element = elementIn(domain, e!, x!, ctx, name);
      const sum = add(pointIn(domain, x!, ctx), element);
      return { type: x!.type, value: pointOut(domain, sum, x!.type, ctx) };
    },
  };
}

export const FUNCTIONS: Readonly<Record<string, FunctionSpec>> = {
  // --- plain mathematics -------------------------------------------------
  exp: plainFn(cexp, 'e^x'),
  ln: plainFn(clog, 'natural logarithm (principal branch)'),
  sqrt: plainFn(csqrt, 'principal square root'),
  sin: plainFn(csin, 'sine (radians)'),
  cos: plainFn(ccos, 'cosine (radians)'),
  tan: plainFn((c) => div(csin(c), ccos(c)), 'tangent (radians)'),
  deg: plainFn((c) => scale(c, 180 / Math.PI), 'radians → degrees'),
  rad: plainFn((c) => scale(c, Math.PI / 180), 'degrees → radians'),

  // --- complex parts (any type) --------------------------------------------
  re: { arity: [1], signature: '(x)', description: 'real part', apply: ([x]) => real(x!.value.re) },
  im: { arity: [1], signature: '(x)', description: 'imaginary part', apply: ([x]) => real(x!.value.im) },
  abs: { arity: [1], signature: '(x)', description: 'magnitude |x|', apply: ([x]) => real(abs(x!.value)) },
  arg: { arity: [1], signature: '(x)', description: 'angle in radians', apply: ([x]) => real(arg(x!.value)) },
  conj: {
    arity: [1],
    signature: '(x)',
    description: 'complex conjugate (keeps the type)',
    apply: ([x]) => ({ type: x!.type, value: conj(x!.value) }),
  },
  polar: {
    arity: [2],
    signature: '(r, θ)',
    description: 'r·e^(jθ), θ in radians',
    apply: ([r, t], _ctx, name) => {
      const rr = plainArg(name, r!);
      const tt = plainArg(name, t!);
      if (r!.type !== 'real' || t!.type !== 'real') throw new TypeMismatch('polar() expects real magnitude and angle');
      return { type: 'complex', value: complex(rr.re * Math.cos(tt.re), rr.re * Math.sin(tt.re)) };
    },
  },

  // --- RF conversions -----------------------------------------------------------
  z: converter('impedance', 'normalized impedance of x, or declare a number as z'),
  y: converter('admittance', 'normalized admittance of x, or declare a number as y'),
  gamma: converter('reflection', 'reflection coefficient of x, or declare a number as Γ'),
  Z: converter('physicalImpedance', 'physical impedance in Ω (uses workspace Z₀)'),
  len: {
    arity: [1],
    signature: '(x)',
    description: 'declare a real number as an electrical length in λ',
    apply: ([x]) => {
      if (x!.type === 'length') return x!;
      if (x!.type !== 'real') throw new TypeMismatch(`len() expects a real number of wavelengths, not ${withArticle(label(x!.type))}`);
      return { type: 'length', value: x!.value };
    },
  },

  // --- RF measurements ----------------------------------------------------------
  vswr: {
    arity: [1],
    signature: '(x)',
    description: 'VSWR of an impedance, admittance or Γ',
    apply: ([x], ctx, name) => real(vswrFromReflection(toReflection(x!, ctx, name))),
  },
  rl: {
    arity: [1],
    signature: '(x)',
    description: 'return loss in dB',
    apply: ([x], ctx, name) => real(returnLossDb(toReflection(x!, ctx, name))),
  },

  // --- RF network operations -------------------------------------------------------
  series: elementOperation(
    'impedance',
    'x with a series element e: z(x) + e. e is a normalized impedance, or a typed z, y or Z; keeps the type of x',
  ),
  shunt: elementOperation(
    'admittance',
    'x with a shunt element e: y(x) + e. e is a normalized admittance, or a typed y, z or Z; keeps the type of x',
  ),

  // --- RF transformations ---------------------------------------------------------
  line: {
    arity: [2],
    signature: '(x, l)',
    description: 'x seen through a lossless line of l wavelengths (toward generator); keeps the type of x',
    apply: ([x, l], ctx, name) => {
      if (l!.type !== 'length' && l!.type !== 'real') {
        throw new TypeMismatch(`line() length must be a real number of wavelengths, not ${withArticle(label(l!.type))}`);
      }
      const rotated = reflectionThroughLine(toReflection(x!, ctx, name), l!.value.re);
      return { type: x!.type, value: fromReflection(rotated, x!.type, ctx) };
    },
  },
};

/** Constants available in every expression. */
export const CONSTANTS: Readonly<Record<string, TypedValue>> = {
  pi: real(Math.PI),
  π: real(Math.PI),
  j: { type: 'complex', value: complex(0, 1) },
};

/** Names that cannot be assigned. */
export function isReservedName(name: string): boolean {
  return name in CONSTANTS;
}
