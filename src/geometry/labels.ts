/**
 * Label placement in the Γ-plane. Each label has an anchor point on the
 * chart and a unit `direction` along which the renderer offsets the text, so
 * the renderer never needs to know any Smith Chart mathematics.
 */
import { type Complex, J, ONE, complex, neg, reflectionFromAdmittance, reflectionFromImpedance } from '../core';
import { DEFAULT_MAJOR_VALUES } from './grid';

export type LabelRole =
  | 'resistance'
  | 'reactance'
  | 'axis-end'
  | 'conductance'
  | 'susceptance'
  | 'wavelength-generator'
  | 'wavelength-load';

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

/** Where a row of labels sits relative to its curve family's natural position. */
export type AxisPlacement = 'above' | 'below';
export type BoundaryPlacement = 'outside' | 'inside';

/**
 * Conductance values on the real axis, at Γ_y(g) = (1 − g)/(1 + g): the
 * mirror image of the resistance scale (g = 0 is at the right, Γ = 1).
 */
export function conductanceAxisLabels(
  values: readonly number[] = DEFAULT_MAJOR_VALUES,
  placement: AxisPlacement = 'above',
): ChartLabel[] {
  return values.map((g) => ({
    id: `label-g:${g}`,
    text: formatGridValue(g),
    role: 'conductance',
    anchor: reflectionFromAdmittance(complex(g, 0)),
    direction: placement === 'above' ? J : neg(J),
  }));
}

/** g = 0 (Γ = +1, open) and g = ∞ (Γ = −1, short) at the ends of the real axis. */
export function conductanceAxisEndLabels(): ChartLabel[] {
  return [
    { id: 'label-g:0', text: '0', role: 'axis-end', anchor: ONE, direction: ONE },
    { id: 'label-g:inf', text: '∞', role: 'axis-end', anchor: complex(-1, 0), direction: complex(-1, 0) },
  ];
}

/**
 * Susceptance values where each constant-b arc meets the boundary (g = 0,
 * Γ = (1 − jb)/(1 + jb)). Positive (capacitive) susceptance is in the lower
 * half. `inside` places the text just inside the unit circle, which keeps it
 * clear of the reactance labels outside.
 */
export function susceptanceBoundaryLabels(
  values: readonly number[] = DEFAULT_MAJOR_VALUES,
  placement: BoundaryPlacement = 'outside',
): ChartLabel[] {
  const labels: ChartLabel[] = [];
  for (const magnitude of values) {
    for (const b of [magnitude, -magnitude]) {
      const anchor = reflectionFromAdmittance(complex(0, b));
      labels.push({
        id: `label-b:${b}`,
        text: formatReactance(b),
        role: 'susceptance',
        anchor,
        direction: placement === 'outside' ? anchor : neg(anchor),
      });
    }
  }
  return labels;
}

/**
 * All grid labels for the enabled grids, placed so that no two labels share
 * a position:
 *
 *   impedance only   r above the axis, x outside the boundary, 0 / ∞ ends
 *   admittance only  g above the axis, b outside the boundary, ∞ / 0 ends
 *   both             r above / g below the axis; x outside / b inside the
 *                    boundary; axis ends labelled once (impedance)
 *
 * (Without this, g = 0.2 would overprint r = 5, and b = 0.5 would overprint
 * x = −2, since the admittance grid is the impedance grid rotated by 180°.)
 */
export function chartLabels(grids: { readonly impedance: boolean; readonly admittance: boolean }): ChartLabel[] {
  const labels: ChartLabel[] = [];
  if (grids.impedance) labels.push(...resistanceAxisLabels(), ...reactanceBoundaryLabels());
  if (grids.admittance) {
    const both = grids.impedance;
    labels.push(
      ...conductanceAxisLabels(DEFAULT_MAJOR_VALUES, both ? 'below' : 'above'),
      ...susceptanceBoundaryLabels(DEFAULT_MAJOR_VALUES, both ? 'inside' : 'outside'),
    );
    if (!both) labels.push(...conductanceAxisEndLabels());
  }
  return labels;
}
