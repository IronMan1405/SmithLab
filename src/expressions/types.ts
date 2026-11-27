/**
 * Typed values.
 *
 * Every value is stored as a `Complex` (real values have im = 0) together
 * with a type that says what the number *means*. Types prevent misleading
 * operations such as adding an impedance to an admittance.
 *
 *   real              plain real number (dimensionless)
 *   complex           plain complex number (dimensionless, no RF meaning)
 *   impedance         normalised impedance z = Z/Z₀
 *   admittance        normalised admittance y = Y·Z₀
 *   reflection        reflection coefficient Γ
 *   physicalImpedance impedance Z in ohms
 *   length            electrical length in wavelengths
 *
 * `real` and `complex` are "plain"; the rest are "domain" types.
 */
import type { Complex } from '../core';
import type { Curve } from '../geometry/curves';

export type ValueType = 'real' | 'complex' | 'impedance' | 'admittance' | 'reflection' | 'physicalImpedance' | 'length';
export type DomainType = Exclude<ValueType, 'real' | 'complex'>;

/** A scalar (number-like) value. */
export interface TypedValue {
  readonly type: ValueType;
  readonly value: Complex;
}

/** A curve in the Γ-plane, produced by a curve construction. */
export interface CurveValue {
  readonly type: 'curve';
  readonly curve: Curve;
}

/** Anything an expression can evaluate to. */
export type Value = TypedValue | CurveValue;

export function isCurve(value: Value): value is CurveValue {
  return value.type === 'curve';
}

export interface TypeInfo {
  /** Short symbol for chips: z, y, Γ … */
  readonly symbol: string;
  /** Human-readable name used in messages. */
  readonly label: string;
  /** Can be placed on the Smith Chart. */
  readonly plottable: boolean;
  /** Function that converts or declares a value as this type. */
  readonly constructorName: string | null;
}

export const TYPE_INFO: Readonly<Record<ValueType, TypeInfo>> = {
  real: { symbol: 'ℝ', label: 'real number', plottable: false, constructorName: null },
  complex: { symbol: 'ℂ', label: 'complex number', plottable: false, constructorName: null },
  impedance: { symbol: 'z', label: 'normalized impedance', plottable: true, constructorName: 'z' },
  admittance: { symbol: 'y', label: 'normalized admittance', plottable: true, constructorName: 'y' },
  reflection: { symbol: 'Γ', label: 'reflection coefficient', plottable: true, constructorName: 'gamma' },
  physicalImpedance: { symbol: 'Ω', label: 'physical impedance (Ω)', plottable: true, constructorName: 'Z' },
  length: { symbol: 'λ', label: 'electrical length (λ)', plottable: false, constructorName: 'len' },
};

export function isPlain(type: ValueType): type is 'real' | 'complex' {
  return type === 'real' || type === 'complex';
}

/** Plain result type: real only when every operand was real and the value has no imaginary part. */
export function plainType(value: Complex, operandsReal: boolean): 'real' | 'complex' {
  return operandsReal && value.im === 0 ? 'real' : 'complex';
}

/** A type error: an operation that is mathematically possible but physically meaningless. */
export class TypeMismatch extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TypeMismatch';
  }
}

const label = (t: ValueType) => TYPE_INFO[t].label;

/** "a normalized impedance", "an electrical length (λ)". */
export function withArticle(text: string): string {
  return /^[aeiou]/i.test(text) ? `an ${text}` : `a ${text}`;
}

export type BinaryOp = '+' | '-' | '*' | '/' | '^';

/**
 * Result type of `a op b` *before* the plain real/complex split, which
 * depends on the computed value. Returns 'plain' for dimensionless results.
 * Throws TypeMismatch for meaningless combinations.
 */
export function binaryResultType(op: BinaryOp, a: ValueType, b: ValueType, bIsReal: boolean, aIsReal: boolean): ValueType | 'plain' {
  const aPlain = isPlain(a);
  const bPlain = isPlain(b);

  if (op === '^') {
    if (!bPlain) throw new TypeMismatch(`An exponent must be a plain number, not ${withArticle(label(b))}`);
    if (a === 'length') throw new TypeMismatch('Cannot raise an electrical length to a power');
    return 'plain';
  }

  if (aPlain && bPlain) return 'plain';

  if (op === '+' || op === '-') {
    if (a === b) return a === 'reflection' ? 'complex' : a;
    if (!aPlain && !bPlain) throw new TypeMismatch(`Cannot ${op === '+' ? 'add' : 'subtract'} ${withArticle(label(a))} and ${withArticle(label(b))}`);
    const domain = aPlain ? b : a;
    const plainIsReal = aPlain ? aIsReal : bIsReal;
    switch (domain) {
      case 'impedance':
      case 'admittance':
        return domain; // e.g. z − 1: arithmetic in the normalised impedance plane
      case 'reflection':
        return 'complex';
      case 'length':
        if (!plainIsReal) throw new TypeMismatch('Cannot add a complex number to an electrical length');
        return 'length';
      case 'physicalImpedance':
        throw new TypeMismatch(
          'Cannot add a dimensionless number to a physical impedance (Ω). Use Z(…) to give it units, or z(…) to normalise',
        );
    }
  }

  if (op === '*') {
    if (aPlain || bPlain) {
      const domain = aPlain ? b : a;
      // A multiple of a length is a plain number (e.g. the angle −4πl); name it
      // l… to declare a length again. This keeps rotate(c, -4*pi*l) an angle.
      if (domain === 'length') return 'plain';
      return domain; // scaling (or rotating, for Γ) keeps the meaning
    }
    if (a === 'length' || b === 'length') throw new TypeMismatch(`Cannot multiply an electrical length by ${withArticle(label(a === 'length' ? b : a))}`);
    return 'complex';
  }

  // op === '/'
  if (bPlain) {
    if (a === 'length') return 'plain';
    return a; // domain / plain
  }
  if (aPlain) {
    switch (b) {
      case 'impedance':
        return 'admittance'; // 1/z = y
      case 'admittance':
        return 'impedance'; // 1/y = z
      case 'reflection':
        return 'complex';
      case 'length':
        return 'plain';
      case 'physicalImpedance':
        throw new TypeMismatch('1/Z would be a physical admittance (S), which is not supported yet. Use y(Z) for normalised admittance');
    }
  }
  if (a === 'length' || b === 'length') {
    if (a === b) return 'plain';
    throw new TypeMismatch(`Cannot divide ${withArticle(label(a))} by ${withArticle(label(b))}`);
  }
  return 'complex';
}

/**
 * Naming convention that declares the type of a *plain* value on assignment.
 * The prefix must be followed by the end of the name, an uppercase letter, a
 * digit or `_` (so `zL`, `z1`, `z_in` are impedances but `zeta` is not).
 *
 *   z…  normalised impedance        y…  normalised admittance
 *   Z…  physical impedance (Ω)      gamma… / Γ…  reflection coefficient
 *   l…  electrical length (λ)
 */
const NAME_RULES: readonly (readonly [RegExp, DomainType])[] = [
  [/^Γ/u, 'reflection'],
  [/^gamma(?![a-z])/, 'reflection'],
  [/^z(?![a-z])/, 'impedance'],
  [/^y(?![a-z])/, 'admittance'],
  [/^Z(?![a-z])/, 'physicalImpedance'],
  [/^l(?![a-z])/, 'length'],
];

/**
 * Human-readable form of NAME_RULES for the expression reference. The
 * examples are checked against `declaredTypeForName` in the tests.
 */
export const NAMING_CONVENTION: readonly {
  readonly prefix: string;
  readonly type: DomainType;
  readonly matches: readonly string[];
  readonly nonMatches: readonly string[];
}[] = [
  { prefix: 'z', type: 'impedance', matches: ['z', 'zL', 'z1', 'z_in'], nonMatches: ['zeta', 'zin'] },
  { prefix: 'y', type: 'admittance', matches: ['y', 'yL', 'y2'], nonMatches: ['yes'] },
  { prefix: 'Z', type: 'physicalImpedance', matches: ['Z', 'ZL', 'Z_load'], nonMatches: ['Zeta'] },
  { prefix: 'gamma, Γ', type: 'reflection', matches: ['gammaL', 'gamma_in', 'Γ', 'Γin'], nonMatches: ['gammas'] },
  { prefix: 'l', type: 'length', matches: ['l', 'l1', 'lStub', 'l_zL'], nonMatches: ['loss', 'k'] },
];

export function declaredTypeForName(name: string): DomainType | null {
  for (const [pattern, type] of NAME_RULES) if (pattern.test(name)) return type;
  return null;
}

/** Apply the naming convention to an assigned value; throws TypeMismatch on a conflict. */
export function applyDeclaredType<V extends Value>(name: string, value: V): V {
  const declared = declaredTypeForName(name);
  if (value.type === 'curve') {
    if (declared) {
      throw new TypeMismatch(
        `"${name}" is named like ${withArticle(label(declared))}, but the expression is a curve. Choose a name without the ${declared === 'reflection' ? 'gamma' : name[0]} prefix, e.g. c1`,
      );
    }
    return value;
  }
  if (!declared || declared === value.type) return value;
  if (isPlain(value.type)) {
    if (declared === 'length' && value.type !== 'real') {
      throw new TypeMismatch(`"${name}" is an electrical length, which must be a real number of wavelengths`);
    }
    return { type: declared, value: value.value } as V;
  }
  const ctor = TYPE_INFO[declared].constructorName;
  throw new TypeMismatch(
    `"${name}" is named like ${withArticle(label(declared))}, but the expression is ${withArticle(label(value.type))}` +
      (ctor ? `. Convert it explicitly with ${ctor}(…)` : ''),
  );
}
