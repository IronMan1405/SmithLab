/**
 * Wavelength scales around the chart perimeter.
 *
 * Layout (three concentric rings, as on the classic printed chart):
 *
 *   outer ring        plain ring closing the toward-generator strip
 *   generator strip   WTG numbers and the "toward generator" title
 *   tick ring         the shared reference ring; ticks straddle it
 *   load strip        WTL numbers and the "toward load" title
 *   inner ring        plain ring closing the toward-load strip
 *
 * Both scales read the same angle, so they share one set of ticks.
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
  /** Plain ring on the inside of the toward-load strip. */
  readonly innerRing: CircleShape;
  /** Shared reference ring carrying the ticks. */
  readonly tickRing: CircleShape;
  /** Plain ring on the outside of the toward-generator strip. */
  readonly outerRing: CircleShape;
  /** Ticks straddling the tick ring (shared by both scales). */
  readonly ticks: readonly ScaleTick[];
  /** WTG numbers, centred in the outer strip. */
  readonly generatorLabels: readonly ChartLabel[];
  /** WTL numbers, centred in the inner strip. */
  readonly loadLabels: readonly ChartLabel[];
  /** Title paths, along the centre of each strip, drawn left-to-right so text is upright. */
  readonly generatorTitlePath: ArcShape;
  readonly loadTitlePath: ArcShape;
}

export interface WavelengthScaleOptions {
  readonly innerRadius: number;
  readonly tickRadius: number;
  readonly outerRadius: number;
  /** Half-length of minor / major ticks on each side of the tick ring. */
  readonly minorTick: number;
  readonly majorTick: number;
  /** Tick spacing in wavelengths. */
  readonly step: number;
  /** Every n-th tick is major and labelled. */
  readonly majorEvery: number;
  /** Angular span of each title path, in radians. */
  readonly titleSpan: number;
}

export const DEFAULT_WAVELENGTH_SCALE: WavelengthScaleOptions = {
  innerRadius: 1.09,
  tickRadius: 1.17,
  outerRadius: 1.25,
  minorTick: 0.007,
  majorTick: 0.014,
  step: 0.01,
  majorEvery: 5,
  // Titles sit in the gap between two numbers (0.05λ = 36° apart).
  titleSpan: (30 * Math.PI) / 180,
};

/** Centre radius of the toward-load (inner) strip. */
export function loadStripRadius(o: WavelengthScaleOptions = DEFAULT_WAVELENGTH_SCALE): number {
  return (o.innerRadius + o.tickRadius) / 2;
}

/** Centre radius of the toward-generator (outer) strip. */
export function generatorStripRadius(o: WavelengthScaleOptions = DEFAULT_WAVELENGTH_SCALE): number {
  return (o.tickRadius + o.outerRadius) / 2;
}

export function formatWavelength(value: number): string {
  return value === 0 ? '0' : value.toFixed(2).replace(/^0/, '');
}

/**
 * Direction (radians, Γ-plane) of an upright text baseline running along a
 * circle at angle φ: clockwise tangent on the upper half, anticlockwise on
 * the lower half, so text always reads left to right and never upside down.
 */
export function uprightTangentAngle(phi: number): number {
  return Math.sin(phi) >= 0 ? phi - Math.PI / 2 : phi + Math.PI / 2;
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

/** Ticks straddling the tick ring, one per `step` wavelengths at the WTG angle. */
export function scaleTicks(options: WavelengthScaleOptions = DEFAULT_WAVELENGTH_SCALE): ScaleTick[] {
  const count = Math.round(PERIOD / options.step);
  const ticks: ScaleTick[] = [];
  for (let i = 0; i < count; i++) {
    const value = i * options.step;
    const angle = wtgAngle(value);
    const major = i % options.majorEvery === 0;
    const half = major ? options.majorTick : options.minorTick;
    ticks.push({
      value,
      major,
      inner: fromPolar(options.tickRadius - half, angle),
      outer: fromPolar(options.tickRadius + half, angle),
    });
  }
  return ticks;
}

export function buildWavelengthScale(options: WavelengthScaleOptions = DEFAULT_WAVELENGTH_SCALE): WavelengthScaleGeometry {
  const count = Math.round(PERIOD / options.step);
  const generatorLabels: ChartLabel[] = [];
  const loadLabels: ChartLabel[] = [];
  const gR = generatorStripRadius(options);
  const lR = loadStripRadius(options);

  for (let i = 0; i < count; i += options.majorEvery) {
    const value = i * options.step;
    const angle = wtgAngle(value);
    const direction = fromPolar(1, angle);
    generatorLabels.push({
      id: `wtg:${i}`,
      text: formatWavelength(value),
      role: 'wavelength-generator',
      anchor: fromPolar(gR, angle),
      direction,
    });
    loadLabels.push({
      id: `wtl:${i}`,
      text: formatWavelength(mod(PERIOD - value, PERIOD)),
      role: 'wavelength-load',
      anchor: fromPolar(lR, angle),
      direction,
    });
  }

  const ring = (radius: number): CircleShape => ({ kind: 'circle', center: complex(0, 0), radius });
  return {
    innerRing: ring(options.innerRadius),
    tickRing: ring(options.tickRadius),
    outerRing: ring(options.outerRadius),
    ticks: scaleTicks(options),
    generatorLabels,
    loadLabels,
    // Top of the outer strip (between WTG .10 and .15), read left → right = clockwise = toward generator.
    generatorTitlePath: titleArc(gR, Math.PI / 2, options.titleSpan, true),
    // Bottom of the inner strip, read left → right = anticlockwise = toward load.
    loadTitlePath: titleArc(lR, -Math.PI / 2, options.titleSpan, false),
  };
}
