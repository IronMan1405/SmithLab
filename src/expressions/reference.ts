/**
 * Data for the in-app Expression Reference.
 *
 * Function names, signatures and descriptions are read from the live
 * registries (FUNCTIONS, CURVE_FUNCTIONS), constants from CONSTANTS and type
 * names from TYPE_INFO, so the reference cannot drift from the engine. This
 * module only adds what the registries do not carry: a category, a readable
 * return type, and a runnable example. The tests check that
 *   - every registry function is documented and nothing else is,
 *   - every example evaluates without error to its documented type,
 *   - every operator-rule and naming-convention example behaves as stated,
 *   - every practical example set evaluates without errors.
 */
import { CURVE_FUNCTIONS } from './curve-functions';
import { CONSTANTS, FUNCTIONS } from './functions';
import type { SliderSpec } from './definitions';
import { NAMING_CONVENTION, TYPE_INFO, type ValueType } from './types';

export type ReferenceResultType = ValueType | 'curve';

export type FunctionCategory = 'math' | 'complex' | 'rf' | 'curve' | 'query';

interface FunctionMeta {
  readonly category: FunctionCategory;
  /** What the function returns, in words. */
  readonly returns: string;
  /** A self-contained bare expression using the function. */
  readonly example: string;
  /** Type the example evaluates to (verified by tests). */
  readonly exampleType: ReferenceResultType;
}

const T = (t: ValueType) => TYPE_INFO[t].label;
const PLAIN = 'real or complex number';

/** Metadata for every registry function, keyed by name. */
export const FUNCTION_META: Readonly<Record<string, FunctionMeta>> = {
  // mathematical
  exp: { category: 'math', returns: PLAIN, example: 'exp(j*pi/2)', exampleType: 'complex' },
  ln: { category: 'math', returns: PLAIN, example: 'ln(2)', exampleType: 'real' },
  sqrt: { category: 'math', returns: PLAIN, example: 'sqrt(-4)', exampleType: 'complex' },
  sin: { category: 'math', returns: PLAIN, example: 'sin(pi/6)', exampleType: 'real' },
  cos: { category: 'math', returns: PLAIN, example: 'cos(pi)', exampleType: 'real' },
  tan: { category: 'math', returns: PLAIN, example: 'tan(pi/4)', exampleType: 'real' },
  deg: { category: 'math', returns: PLAIN, example: 'deg(pi/2)', exampleType: 'real' },
  rad: { category: 'math', returns: PLAIN, example: 'rad(90)', exampleType: 'real' },
  // complex parts (accept any value type)
  re: { category: 'complex', returns: T('real'), example: 're(z(0.5 + j1.2))', exampleType: 'real' },
  im: { category: 'complex', returns: T('real'), example: 'im(z(0.5 + j1.2))', exampleType: 'real' },
  abs: { category: 'complex', returns: T('real'), example: 'abs(gamma(0.3 + j0.4))', exampleType: 'real' },
  arg: { category: 'complex', returns: `${T('real')} (radians)`, example: 'deg(arg(gamma(j0.5)))', exampleType: 'real' },
  conj: { category: 'complex', returns: 'same type as x', example: 'conj(z(1 + j))', exampleType: 'impedance' },
  polar: { category: 'complex', returns: T('complex'), example: 'polar(0.5, pi/4)', exampleType: 'complex' },
  // RF conversions, measurements, transformations
  z: { category: 'rf', returns: T('impedance'), example: 'z(gamma(0.2 + j0.4))', exampleType: 'impedance' },
  y: { category: 'rf', returns: T('admittance'), example: 'y(z(1 + j))', exampleType: 'admittance' },
  gamma: { category: 'rf', returns: T('reflection'), example: 'gamma(z(2))', exampleType: 'reflection' },
  Z: { category: 'rf', returns: T('physicalImpedance'), example: 'Z(z(0.5 + j1.2))', exampleType: 'physicalImpedance' },
  len: { category: 'rf', returns: T('length'), example: 'len(0.125)', exampleType: 'length' },
  vswr: { category: 'rf', returns: T('real'), example: 'vswr(z(2))', exampleType: 'real' },
  rl: { category: 'rf', returns: `${T('real')} (dB)`, example: 'rl(z(2))', exampleType: 'real' },
  line: { category: 'rf', returns: 'same type as x', example: 'line(z(0.5 + j1.2), 0.125)', exampleType: 'impedance' },
  // curve constructions
  vswrCircle: { category: 'curve', returns: 'curve (parameter: WTG, 0–0.5λ)', example: 'vswrCircle(2)', exampleType: 'curve' },
  rCircle: { category: 'curve', returns: 'curve (parameter: x)', example: 'rCircle(1)', exampleType: 'curve' },
  xCircle: { category: 'curve', returns: 'curve (parameter: r)', example: 'xCircle(-0.5)', exampleType: 'curve' },
  gCircle: { category: 'curve', returns: 'curve (parameter: b)', example: 'gCircle(1)', exampleType: 'curve' },
  bCircle: { category: 'curve', returns: 'curve (parameter: g)', example: 'bCircle(0.5)', exampleType: 'curve' },
  linePath: { category: 'curve', returns: 'curve (parameter: l)', example: 'linePath(z(2), 0.25)', exampleType: 'curve' },
  radial: { category: 'curve', returns: 'curve (parameter: |Γ|, 0–1)', example: 'radial(z(0.5 + j1.2))', exampleType: 'curve' },
  // queries
  intersect: { category: 'query', returns: T('reflection'), example: 'intersect(rCircle(0.5), xCircle(1.2), 1)', exampleType: 'reflection' },
  at: { category: 'query', returns: T('reflection'), example: 'at(vswrCircle(3), 0.125)', exampleType: 'reflection' },
};

export interface ReferenceFunction {
  readonly name: string;
  /** e.g. `line(x, l)` */
  readonly syntax: string;
  readonly description: string;
  readonly returns: string;
  readonly example: string;
  readonly exampleType: ReferenceResultType;
}

/** `curve(...)` is a special form handled by the evaluator, not a registry entry. */
export const CURVE_SPECIAL_FORM: ReferenceFunction = {
  name: 'curve',
  syntax: 'curve(expr, t, t0, t1)',
  description:
    'parametric curve: expr is evaluated for t from t0 to t1 and must give z, y, Γ or Z. t is local to the curve (it is not a variable and shadows one of the same name).',
  returns: 'curve (parameter: t)',
  example: 'curve(gamma(0.5*exp(-j*4*pi*t)), t, 0, 0.5)',
  exampleType: 'curve',
};

function fromRegistry(name: string): ReferenceFunction | null {
  const spec = FUNCTIONS[name] ?? CURVE_FUNCTIONS[name];
  const meta = FUNCTION_META[name];
  if (!spec || !meta) return null;
  // Signatures like "(x, l) or (x, l0, l1)" become "linePath(x, l) or linePath(x, l0, l1)".
  const syntax = spec.signature
    .split(' or ')
    .map((s) => `${name}${s}`)
    .join(' or ');
  return { name, syntax, description: spec.description, returns: meta.returns, example: meta.example, exampleType: meta.exampleType };
}

export function functionsInCategory(...categories: FunctionCategory[]): ReferenceFunction[] {
  return Object.keys(FUNCTION_META)
    .filter((name) => categories.includes(FUNCTION_META[name]!.category))
    .map(fromRegistry)
    .filter((f): f is ReferenceFunction => f !== null);
}

/** Every documented registry function name. */
export function documentedFunctionNames(): string[] {
  return Object.keys(FUNCTION_META);
}

export interface ConstantEntry {
  readonly name: string;
  readonly meaning: string;
}

export function referenceConstants(): ConstantEntry[] {
  return Object.keys(CONSTANTS).map((name) => ({
    name,
    meaning: name === 'j' ? 'imaginary unit (j² = −1)' : 'π ≈ 3.14159',
  }));
}

export interface NamingEntry {
  readonly prefix: string;
  readonly typeLabel: string;
  readonly matches: readonly string[];
  readonly nonMatches: readonly string[];
}

export function referenceNaming(): NamingEntry[] {
  return NAMING_CONVENTION.map((r) => ({ ...r, typeLabel: T(r.type) }));
}

export interface TypeEntry {
  readonly type: ReferenceResultType;
  readonly symbol: string;
  readonly label: string;
  readonly display: string;
}

export function referenceTypes(): TypeEntry[] {
  const display = (t: ValueType) =>
    TYPE_INFO[t].plottable ? 'plotted as a point (■)' : t === 'complex' ? 'not plotted — wrap in z(), y() or gamma()' : 'not plotted (can drive a slider)';
  return [
    ...(Object.keys(TYPE_INFO) as ValueType[]).map((t) => ({
      type: t,
      symbol: TYPE_INFO[t].symbol,
      label: TYPE_INFO[t].label,
      display: display(t),
    })),
    { type: 'curve', symbol: '∿', label: 'curve', display: 'drawn on the chart' },
  ];
}

/**
 * Operator rules, each shown with an expression that demonstrates it.
 * `given` lines are evaluated first; `result` is checked by the tests.
 */
export const OPERATOR_RULES: readonly {
  readonly expression: string;
  readonly given: readonly string[];
  readonly result: ValueType | 'error';
  readonly note: string;
}[] = [
  { expression: 'zA + zB', given: ['zA = 1 + j', 'zB = 2'], result: 'impedance', note: 'series combination' },
  { expression: 'zA - 1', given: ['zA = 1 + j'], result: 'impedance', note: 'plain numbers act in the z-plane' },
  { expression: '1/zA', given: ['zA = 1 + j'], result: 'admittance', note: 'reciprocal of z is y' },
  { expression: '1/yA', given: ['yA = 0.5 - j0.5'], result: 'impedance', note: 'reciprocal of y is z' },
  { expression: 'zA/zB', given: ['zA = 1 + j', 'zB = 2'], result: 'complex', note: 'a ratio has no RF type' },
  { expression: 'gammaA * exp(-j*pi/2)', given: ['gammaA = 0.5'], result: 'reflection', note: 'rotating Γ keeps it a Γ' },
  { expression: 'lA * 2', given: ['lA = 0.1'], result: 'length', note: 'scaling a length' },
  { expression: '-j*4*pi*lA', given: ['lA = 0.1'], result: 'complex', note: 'a phase, not a length' },
  { expression: 'zA + yA', given: ['zA = 1 + j', 'yA = 1'], result: 'error', note: 'impedance + admittance is rejected' },
  { expression: 'ZA + 1', given: ['ZA = 50'], result: 'error', note: 'Ω + dimensionless is rejected' },
  { expression: 'exp(zA)', given: ['zA = 1 + j'], result: 'error', note: 'maths functions take plain numbers' },
];

export interface ExampleSet {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly lines: readonly { readonly text: string; readonly slider?: SliderSpec; readonly hidden?: boolean }[];
}

const LENGTH_SLIDER: SliderSpec = { min: 0, max: 0.5, step: 0.001 };

/** Practical example sets. Each is checked by the tests to evaluate without errors. */
export const EXAMPLE_SETS: readonly ExampleSet[] = [
  {
    id: 'line',
    title: 'Load through a transmission line',
    summary: 'Move the slider: z_in travels around the VSWR circle.',
    lines: [
      { text: 'zL = 0.5 + j1.2' },
      { text: 'l = 0.125', slider: LENGTH_SLIDER },
      { text: 'zIn = line(zL, l)' },
      { text: 'vswrL = vswr(zL)' },
    ],
  },
  {
    id: 'quarter',
    title: 'Quarter-wave transformer',
    summary: 'λ/4 of line turns z into 1/z.',
    lines: [{ text: 'zA = 2 + j0.5' }, { text: 'zQ = line(zA, 0.25)' }, { text: 'check = zQ * zA' }],
  },
  {
    id: 'conversions',
    title: 'One load, four views',
    summary: 'z, y, Γ and Z of the same load plot at the same place.',
    lines: [{ text: 'zB = 1 + j1' }, { text: 'yB = 1/zB' }, { text: 'gammaB = gamma(zB)' }, { text: 'ZB = Z(zB)' }],
  },
  {
    id: 'match',
    title: 'Matching candidates',
    summary: 'Where the load\'s VSWR circle meets r = 1.',
    lines: [
      { text: 'zC = 0.6 + j0.8' },
      { text: 'vswrC = vswrCircle(zC)' },
      { text: 'rUnit = rCircle(1)' },
      { text: 'pA = intersect(vswrC, rUnit, 1)' },
      { text: 'pB = intersect(vswrC, rUnit, 2)' },
    ],
  },
  {
    id: 'path',
    title: 'Line path and radial guide',
    summary: 'The arc a line traces, and the angle of the load.',
    lines: [
      { text: 'zD = 0.3 - j0.6' },
      { text: 'lD = 0.2', slider: LENGTH_SLIDER },
      { text: 'pathD = linePath(zD, lD)' },
      { text: 'guideD = radial(zD)' },
    ],
  },
  {
    id: 'spiral',
    title: 'Parametric curve',
    summary: 'Any curve Γ(t) — here a decaying spiral.',
    lines: [{ text: 'spiral = curve(gamma(0.9*exp(-0.6*t)*exp(j*4*pi*t)), t, 0, 2)' }],
  },
];

/** Defined names in an example set (for detecting clashes with the workspace). */
export function exampleSetNames(set: ExampleSet): string[] {
  return set.lines.map((l) => /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*=/u.exec(l.text)?.[1]).filter((n): n is string => !!n);
}
