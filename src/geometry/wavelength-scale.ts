/**
 * Wavelength scales around the chart perimeter.
 *
 * Orientation convention (the conventional Smith Chart layout)
 * ------------------------------------------------------------
 * Both scales start at 0 at the short-circuit point (Γ = −1, the left of the
 * chart) and span one half wavelength per revolution.
 *
 *   - "Wavelengths toward generator" (WTG) increase **clockwise**:
 *     0 (left) → 0.125 (top) → 0.25 (right) → 0.375 (bottom) → 0.5 (left).
 *     Moving d toward the generator multiplies Γ by e^(−j4πd), a clockwise
 *     rotation of 4πd, so the WTG reading increases by exactly d.
 *   - "Wavelengths toward load" (WTL) increase counter-clockwise:
 *     WTL = (½ − WTG) mod ½.
 *
 * In terms of the Γ angle φ (radians):  WTG = ((π − φ) / 4π) mod ½.
 */
import { type Complex, abs, arg, complex, fromPolar } from '../core';
import type { ChartLabel } from './labels';
import type { ArcShape, CircleShape } from './shapes';
import { ZERO_CENTER } from './shapes';

const PERIOD = 0.5;

function mod(value: number, period: number): number {
  const r = value % period;
  const positive = r < 0 ? r + period : r;
  // Values within round-off of a full period read as 0.
  return Math.abs(positive - period) < 1e-12 ? 0 : positive;
}

/** WTG reading for a Γ direction, in [0, ½); null when Γ = 0 (no direction). */
export function wavelengthsTowardGenerator(gamma: Complex): number | null {
  if (abs(gamma) === 0 || !Number.isFinite(abs(gamma))) return null;
  return mod((Math.PI - arg(gamma)) / (4 * Math.PI), PERIOD);
}

/** WTL reading for a Γ direction, in [0, ½); null when Γ = 0. */
export function wavelengthsTowardLoad(gamma: Complex): number | null {
  const wtg = wavelengthsTowardGenerator(gamma);
  return wtg === null ? null : mod(PERIOD - wtg, PERIOD);
}

/** Γ-plane angle (radians) at which the WTG scale reads `wtg`. */
export function wtgAngle(wtg: number): number {
  return Math.PI - 4 * Math.PI * wtg;
}

export interface ScaleTick {
  /** WTG reading at this tick. */
  readonly value: number;
  readonly major: boolean;
  readonly inner: Complex;
  readonly outer: Complex;
}

export interface WavelengthScaleGeometry {
  readonly ring: CircleShape;
  readonly ticks: readonly ScaleTick[];
  readonly generatorLabels: readonly ChartLabel[];
  readonly loadLabels: readonly ChartLabel[];
  /** Paths for the scale titles, drawn left-to-right so text is upright. */
  readonly generatorTitlePath: ArcShape;
  readonly loadTitlePath: ArcShape;
}

export interface WavelengthScaleOptions {
  readonly ringRadius: number;
  readonly minorTick: number;
  readonly majorTick: number;
  /** Tick spacing in wavelengths. */
  readonly step: number;
  /** Every n-th tick is major and labelled. */
  readonly majorEvery: number;
  readonly loadLabelRadius: number;
  readonly generatorLabelRadius: number;
  readonly generatorTitleRadius: number;
  readonly loadTitleRadius: number;
}

export const DEFAULT_WAVELENGTH_SCALE: WavelengthScaleOptions = {
  ringRadius: 1.1,
  minorTick: 0.014,
  majorTick: 0.028,
  step: 0.01,
  majorEvery: 5,
  loadLabelRadius: 1.145,
  generatorLabelRadius: 1.205,
  generatorTitleRadius: 1.262,
  loadTitleRadius: 1.29,
};

export function formatWavelength(value: number): string {
  return value === 0 ? '0' : value.toFixed(2).replace(/^0/, '');
}

function titleArc(radius: number, centerAngle: number, span: number, clockwise: boolean): ArcShape {
  const startAngle = centerAngle + (clockwise ? span / 2 : -span / 2);
  const sweep = clockwise ? -span : span;
  return {
    kind: 'arc',
    center: ZERO_CENTER,
    radius,
    start: fromPolar(radius, startAngle),
    end: fromPolar(radius, startAngle + sweep),
    startAngle,
    sweep,
  };
}

export function buildWavelengthScale(options: WavelengthScaleOptions = DEFAULT_WAVELENGTH_SCALE): WavelengthScaleGeometry {
  const count = Math.round(PERIOD / options.step);
  const ticks: ScaleTick[] = [];
  const generatorLabels: ChartLabel[] = [];
  const loadLabels: ChartLabel[] = [];

  for (let i = 0; i < count; i++) {
    const value = i * options.step;
    const angle = wtgAngle(value);
    const major = i % options.majorEvery === 0;
    const length = major ? options.majorTick : options.minorTick;
    ticks.push({
      value,
      major,
      inner: fromPolar(options.ringRadius, angle),
      outer: fromPolar(options.ringRadius + length, angle),
    });
    if (major) {
      const direction = fromPolar(1, angle);
      generatorLabels.push({
        id: `wtg:${i}`,
        text: formatWavelength(value),
        role: 'wavelength-generator',
        anchor: fromPolar(options.generatorLabelRadius, angle),
        direction,
      });
      loadLabels.push({
        id: `wtl:${i}`,
        text: formatWavelength(mod(PERIOD - value, PERIOD)),
        role: 'wavelength-load',
        anchor: fromPolar(options.loadLabelRadius, angle),
        direction,
      });
    }
  }

  return {
    ring: { kind: 'circle', center: complex(0, 0), radius: options.ringRadius },
    ticks,
    generatorLabels,
    loadLabels,
    // Top of the chart, read left → right = clockwise = toward generator.
    generatorTitlePath: titleArc(options.generatorTitleRadius, Math.PI / 2, (2 * Math.PI) / 3, true),
    // Bottom of the chart, read left → right = counter-clockwise = toward load.
    loadTitlePath: titleArc(options.loadTitleRadius, -Math.PI / 2, (2 * Math.PI) / 3, false),
  };
}
