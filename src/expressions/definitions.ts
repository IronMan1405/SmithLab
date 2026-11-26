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
}

export function createExpressionDef(id: string, text = ''): ExpressionDef {
  return { id, text, enabled: true, visible: true, slider: null };
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
