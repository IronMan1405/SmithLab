/**
 * Label placement in the Γ-plane. Each label has an anchor point on the
 * chart and a unit `direction` along which the renderer offsets the text, so
 * the renderer never needs to know any Smith Chart mathematics.
 */
import { type Complex, J, ONE, complex, reflectionFromImpedance } from '../core';
import { DEFAULT_MAJOR_VALUES } from './grid';

export type LabelRole = 'resistance' | 'reactance' | 'axis-end';

export interface ChartLabel {
  readonly id: string;
  readonly text: string;
  readonly role: LabelRole;
  /** Anchor in the Γ-plane. */
  readonly anchor: Complex;
  /** Unit vector (Γ-plane) pointing away from the anchor toward the text. */
  readonly direction: Complex;
}

const MINUS = '−';

/** Compact decimal formatting for grid values: 0.2, 1.5, 10. */
export function formatGridValue(value: number): string {
  if (value === Infinity) return '∞';
  if (value === -Infinity) return `${MINUS}∞`;
  const text = String(Number(value.toPrecision(6)));
  return text.replace('-', MINUS);
}

export function formatReactance(x: number): string {
  return x < 0 ? `${MINUS}j${formatGridValue(-x)}` : `j${formatGridValue(x)}`;
}

/** Resistance values written just above the real axis, at Γ(r + j0). */
export function resistanceAxisLabels(values: readonly number[] = DEFAULT_MAJOR_VALUES): ChartLabel[] {
  const labels: ChartLabel[] = values.map((r) => ({
    id: `label-r:${r}`,
    text: formatGridValue(r),
    role: 'resistance',
    anchor: reflectionFromImpedance(complex(r, 0)),
    direction: J,
  }));
  labels.push(
    { id: 'label-r:0', text: '0', role: 'axis-end', anchor: complex(-1, 0), direction: complex(-1, 0) },
    { id: 'label-r:inf', text: '∞', role: 'axis-end', anchor: ONE, direction: ONE },
  );
  return labels;
}

/**
 * Reactance values written just outside the unit circle, where each
 * constant-x arc meets the boundary (r = 0, Γ = (jx − 1)/(jx + 1)).
 */
export function reactanceBoundaryLabels(values: readonly number[] = DEFAULT_MAJOR_VALUES): ChartLabel[] {
  const labels: ChartLabel[] = [];
  for (const magnitude of values) {
    for (const x of [magnitude, -magnitude]) {
      const anchor = reflectionFromImpedance(complex(0, x));
      labels.push({ id: `label-x:${x}`, text: formatReactance(x), role: 'reactance', anchor, direction: anchor });
    }
  }
  return labels;
}
