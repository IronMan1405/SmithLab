/**
 * Grid specification and generation.
 *
 * A grid is described declaratively: which constant-real (r or g) and
 * constant-imaginary (x or b) values to draw, and over which range of the
 * *other* coordinate each curve extends. Limiting the extent of minor curves
 * is what keeps a Smith Chart readable near Γ = 1, where every curve
 * converges. Each minor curve stops exactly on a major curve, so the grid
 * forms closed cells.
 */
import { type Shape } from './shapes';
import { reactanceCurve, resistanceCurve } from './impedance-circles';
import { conductanceCurve, susceptanceCurve } from './admittance-circles';

export type GridTier = 'major' | 'minor';
export type GridSystem = 'impedance' | 'admittance';
export type GridFamily = 'resistance' | 'reactance' | 'conductance' | 'susceptance';

export interface GridLineSpec {
  /** Constant normalised value of the curve (r, x, g or b). x/b values are positive and mirrored. */
  readonly value: number;
  /** Extent along the other coordinate. */
  readonly from: number;
  readonly to: number;
  readonly tier: GridTier;
}

export interface GridSpec {
  /** Constant-real curves (resistance / conductance), value > 0. */
  readonly real: readonly GridLineSpec[];
  /** Constant-imaginary curves, value > 0; each is drawn at ±value. */
  readonly imaginary: readonly GridLineSpec[];
}

export interface GridCurve {
  readonly id: string;
  readonly system: GridSystem;
  readonly family: GridFamily;
  readonly value: number;
  readonly tier: GridTier;
  readonly shape: Shape;
}

function lines(values: readonly number[], from: number, to: number, tier: GridTier): GridLineSpec[] {
  return values.map((value) => ({ value, from, to, tier }));
}

const FINE = [0.1, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9];
const MID = [1.5, 3, 4];

/** Values drawn as major (labelled) curves in the default grid. */
export const DEFAULT_MAJOR_VALUES: readonly number[] = [0.2, 0.5, 1, 2, 5, 10];

export const DEFAULT_GRID_SPEC: GridSpec = {
  real: [
    ...lines(DEFAULT_MAJOR_VALUES, -Infinity, Infinity, 'major'),
    ...lines(FINE, -2, 2, 'minor'),
    ...lines(MID, -5, 5, 'minor'),
  ],
  imaginary: [
    ...lines(DEFAULT_MAJOR_VALUES, 0, Infinity, 'major'),
    ...lines(FINE, 0, 2, 'minor'),
    ...lines(MID, 0, 5, 'minor'),
  ],
};

function assertPositive(spec: GridLineSpec): void {
  if (!(spec.value > 0) || !Number.isFinite(spec.value)) {
    throw new RangeError(`Grid values must be finite and > 0 (got ${spec.value})`);
  }
}

export function buildImpedanceGrid(spec: GridSpec = DEFAULT_GRID_SPEC): GridCurve[] {
  const curves: GridCurve[] = [];
  for (const line of spec.real) {
    assertPositive(line);
    curves.push({
      id: `r:${line.value}`,
      system: 'impedance',
      family: 'resistance',
      value: line.value,
      tier: line.tier,
      shape: resistanceCurve(line.value, line.from, line.to),
    });
  }
  for (const line of spec.imaginary) {
    assertPositive(line);
    for (const x of [line.value, -line.value]) {
      curves.push({
        id: `x:${x}`,
        system: 'impedance',
        family: 'reactance',
        value: x,
        tier: line.tier,
        shape: reactanceCurve(x, line.from, line.to),
      });
    }
  }
  return curves;
}

export function buildAdmittanceGrid(spec: GridSpec = DEFAULT_GRID_SPEC): GridCurve[] {
  const curves: GridCurve[] = [];
  for (const line of spec.real) {
    assertPositive(line);
    curves.push({
      id: `g:${line.value}`,
      system: 'admittance',
      family: 'conductance',
      value: line.value,
      tier: line.tier,
      shape: conductanceCurve(line.value, line.from, line.to),
    });
  }
  for (const line of spec.imaginary) {
    assertPositive(line);
    for (const b of [line.value, -line.value]) {
      curves.push({
        id: `b:${b}`,
        system: 'admittance',
        family: 'susceptance',
        value: b,
        tier: line.tier,
        shape: susceptanceCurve(b, line.from, line.to),
      });
    }
  }
  return curves;
}

export interface ChartFrame {
  /** |Γ| = 1: r = 0 (equivalently g = 0). */
  readonly boundary: Shape;
  /** Im Γ = 0: x = 0 for 0 ≤ r ≤ ∞ (equivalently b = 0). */
  readonly realAxis: Shape;
}

export function buildChartFrame(): ChartFrame {
  return {
    boundary: resistanceCurve(0),
    realAxis: reactanceCurve(0, 0, Infinity),
  };
}
