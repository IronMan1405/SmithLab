/** Display formatting for numeric read-outs (presentation only). */
import { type Complex, isInfinite, isNaNComplex } from '../core';

const MINUS = '−';

export function formatNumber(value: number, significant = 4): string {
  if (Number.isNaN(value)) return '—';
  if (value === Infinity) return '∞';
  if (value === -Infinity) return `${MINUS}∞`;
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  const text =
    magnitude >= 1e6 || magnitude < 1e-4
      ? value.toExponential(significant - 1)
      : String(Number(value.toPrecision(significant)));
  return text.replace('-', MINUS);
}

export function formatComplex(c: Complex, significant = 4): string {
  if (isNaNComplex(c)) return '—';
  if (isInfinite(c)) return '∞';
  const sign = c.im < 0 || Object.is(c.im, -0) ? MINUS : '+';
  return `${formatNumber(c.re, significant)} ${sign} j${formatNumber(Math.abs(c.im), significant)}`;
}
