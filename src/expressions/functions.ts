/**
 * Built-in functions. Each entry validates its argument types and computes
 * with the core engine. New domain functions (series/shunt elements, stubs,
 * frequency-dependent models…) are added here without touching the parser
 * or evaluator.
 */
import {
  type Complex,
  abs,
  admittanceFromImpedance,
  admittanceFromReflection,
  arg,
  complex,
  conj,
  div,
  impedanceFromAdmittance,
  impedanceFromReflection,
  reflectionFromAdmittance,
  reflectionFromImpedance,
  reflectionThroughLine,
  returnLossDb,
  scale,
  vswrFromReflection,
} from '../core';
import { type TypedValue, type ValueType, TYPE_INFO, TypeMismatch, isPlain, plainType } from './types';

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
  if (!isPlain(v.type)) throw new TypeMismatch(`${name}() expects a plain number, not a ${label(v.type)}`);
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
      throw new TypeMismatch(`${name}() needs an impedance, admittance or reflection coefficient, not a ${label(v.type)}`);
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
      if (x!.type !== 'real') throw new TypeMismatch(`len() expects a real number of wavelengths, not a ${label(x!.type)}`);
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

  // --- RF transformations ---------------------------------------------------------
  line: {
    arity: [2],
    signature: '(x, l)',
    description: 'x seen through a lossless line of l wavelengths (toward generator); keeps the type of x',
    apply: ([x, l], ctx, name) => {
      if (l!.type !== 'length' && l!.type !== 'real') {
        throw new TypeMismatch(`line() length must be a real number of wavelengths, not a ${label(l!.type)}`);
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
