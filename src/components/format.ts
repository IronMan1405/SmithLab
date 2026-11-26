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

/**
 * Components smaller than this fraction of the larger one are round-off
 * (e.g. 0.4939 − j2.4e−16 after a full rotation) and are shown as 0.
 */
const NOISE = 1e-12;

export function formatComplex(raw: Complex, significant = 4): string {
  if (isNaNComplex(raw)) return '—';
  if (isInfinite(raw)) return '∞';
  const scale = Math.max(Math.abs(raw.re), Math.abs(raw.im));
  const c = {
    re: Math.abs(raw.re) < NOISE * scale ? 0 : raw.re,
    im: Math.abs(raw.im) < NOISE * scale ? 0 : raw.im,
  };
  const sign = c.im < 0 || Object.is(c.im, -0) ? MINUS : '+';
  return `${formatNumber(c.re, significant)} ${sign} j${formatNumber(Math.abs(c.im), significant)}`;
}
