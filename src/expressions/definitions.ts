/**
 * Stored form of an expression and slider helpers.
 *
 * The expression *text* is the single source of truth: names, values, types
 * and dependencies are all derived from it. A slider does not hold a value of
 * its own; moving it rewrites the literal in the text.
 */
import { parseCached } from './parser';

export interface SliderSpec {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface ExpressionDef {
  readonly id: string;
  readonly text: string;
  /** Disabled expressions are not evaluated; dependents report an error. */
  readonly enabled: boolean;
  /** Plottable results are drawn only when visible. Does not affect evaluation. */
  readonly visible: boolean;
  readonly slider: SliderSpec | null;
  /** Curve colour (palette key, see CURVE_COLORS); null = automatic. */
  readonly color: CurveColor | null;
}

/** Theme-aware curve palette; each key maps to a CSS variable `--curve-<key>`. */
export const CURVE_COLORS = ['teal', 'orange', 'violet', 'blue', 'pink', 'green'] as const;
export type CurveColor = (typeof CURVE_COLORS)[number];

export function createExpressionDef(id: string, text = ''): ExpressionDef {
  return { id, text, enabled: true, visible: true, slider: null, color: null };
}

/**
 * If `text` is `name = <real literal>` (optionally negated), return the name
 * and value — the only form a slider can drive.
 */
export function sliderLiteral(text: string): { name: string; value: number } | null {
  const parsed = parseCached(text);
  if (!parsed.ok || !parsed.statement.name) return null;
  let body = parsed.statement.body;
  let sign = 1;
  while (body.kind === 'unary') {
    if (body.op === '-') sign = -sign;
    body = body.operand;
  }
  if (body.kind !== 'number') return null;
  return { name: parsed.statement.name, value: sign * body.value };
}

export function assertSlider(spec: SliderSpec): void {
  const { min, max, step } = spec;
  if (![min, max, step].every(Number.isFinite) || !(min < max) || !(step > 0)) {
    throw new RangeError(`Invalid slider: need finite min < max and step > 0 (got ${min}, ${max}, ${step})`);
  }
}

function niceCeil(x: number): number {
  const p = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 5, 10]) if (m * p >= x) return m * p;
  return 10 * p;
}

/** A sensible default range: 0–½λ for lengths, otherwise a "nice" range containing the value. */
export function defaultSlider(name: string, value: number): SliderSpec {
  if (/^l(?![a-z])/.test(name)) {
    return { min: Math.min(0, value), max: Math.max(0.5, value), step: 0.001 };
  }
  const span = niceCeil(Math.max(1, Math.abs(value) * 2));
  return { min: value < 0 ? -span : 0, max: span, step: span / 1000 };
}

function decimalsOf(step: number): number {
  const text = String(step);
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** Format a slider value with the precision implied by its step. */
export function formatSliderValue(value: number, step: number): string {
  const rounded = Math.round(value / step) * step;
  const fixed = rounded.toFixed(Math.min(12, decimalsOf(step)));
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return trimmed === '-0' ? '0' : trimmed;
}

/** Rewrite `name = <literal>` with a new value; null if the text is not a slider literal. */
export function withSliderValue(text: string, value: number, step: number): string | null {
  const literal = sliderLiteral(text);
  if (!literal) return null;
  return `${literal.name} = ${formatSliderValue(value, step)}`;
}

// ---------------------------------------------------------------------------
// Dragging expression-defined points
// ---------------------------------------------------------------------------

/**
 * Only *literal* point expressions can be dragged, so a drag never rewrites
 * a computation or an upstream expression:
 *
 *   name = a + jb          name = a - jb       name = jb      name = a
 *   name = z(a + jb)       (also y(…), gamma(…), Z(…) around a literal)
 *
 * Anything else (references, arithmetic on other names, function results)
 * is computed and is not draggable.
 */
export interface DraggableLiteral {
  readonly name: string;
  /** Conversion/declaration wrapper to preserve, e.g. 'z'. */
  readonly wrapper: string | null;
}

const WRAPPERS = new Set(['z', 'y', 'gamma', 'Z']);

function isRealLiteral(node: import('./ast').Node): boolean {
  return node.kind === 'number' || (node.kind === 'unary' && node.operand.kind === 'number');
}

function isImaginaryLiteral(node: import('./ast').Node): boolean {
  return node.kind === 'imaginary' || (node.kind === 'unary' && node.operand.kind === 'imaginary');
}

function isComplexLiteral(node: import('./ast').Node): boolean {
  if (isRealLiteral(node) || isImaginaryLiteral(node)) return true;
  return (
    node.kind === 'binary' &&
    (node.op === '+' || node.op === '-') &&
    isRealLiteral(node.left) &&
    node.right.kind === 'imaginary'
  );
}

export function draggableLiteral(text: string): DraggableLiteral | null {
  const parsed = parseCached(text);
  if (!parsed.ok || !parsed.statement.name) return null;
  const body = parsed.statement.body;
  if (body.kind === 'call' && WRAPPERS.has(body.name) && body.args.length === 1 && isComplexLiteral(body.args[0]!)) {
    return { name: parsed.statement.name, wrapper: body.name };
  }
  return isComplexLiteral(body) ? { name: parsed.statement.name, wrapper: null } : null;
}

function trimNumber(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return trimmed === '-0' ? '0' : trimmed;
}

/** Format a complex number as an expression literal: `0.5 + j1.2`, `-j0.3`, `2`. */
export function formatComplexLiteral(re: number, im: number, decimals: number): string {
  const r = trimNumber(re, decimals);
  const i = trimNumber(Math.abs(im), decimals);
  if (i === '0') return r;
  const sign = im < 0 ? '-' : '+';
  if (r === '0') return sign === '-' ? `-j${i}` : `j${i}`;
  return `${r} ${sign} j${i}`;
}

/**
 * Rewrite a draggable literal so that it equals `value` (already converted
 * into the expression's own type). Normalised quantities keep 4 decimals,
 * physical impedances (Ω) keep 2. Returns null if the text is not a
 * draggable literal or the value is not finite.
 */
export function withDraggedValue(text: string, value: import('../core').Complex, physical: boolean): string | null {
  const literal = draggableLiteral(text);
  if (!literal || !Number.isFinite(value.re) || !Number.isFinite(value.im)) return null;
  const body = formatComplexLiteral(value.re, value.im, physical ? 2 : 4);
  return `${literal.name} = ${literal.wrapper ? `${literal.wrapper}(${body})` : body}`;
}
