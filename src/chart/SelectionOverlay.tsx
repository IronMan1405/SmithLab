import type { Complex } from '../core';
import { type Shape, reactanceCurve, reflectionMagnitudeCircle, resistanceCurve } from '../geometry';
import { shapeToPath } from './svg-path';

interface SelectionOverlayProps {
  /** Reflection coefficient of the selected point. */
  readonly gamma: Complex;
  /** Its normalised impedance (as derived by the workspace layer). */
  readonly z: Complex;
  readonly gammaMagnitude: number;
  /** Omit the |Γ| circle when a transmission-line path already shows it. */
  readonly showVswrCircle: boolean;
}

/**
 * Constant-r circle, constant-x arc and constant-|Γ| (VSWR) circle through
 * the selected point. Degenerate cases (open circuit, matched load) simply
 * omit the curves that don't exist.
 */
export function SelectionOverlay({ z, gammaMagnitude, showVswrCircle }: SelectionOverlayProps) {
  const curves: { key: string; className: string; shape: Shape }[] = [];
  if (showVswrCircle && gammaMagnitude > 0 && gammaMagnitude < 1) {
    curves.push({ key: 'vswr', className: 'selection-vswr', shape: reflectionMagnitudeCircle(gammaMagnitude) });
  }
  if (Number.isFinite(z.re) && z.re > 0) {
    curves.push({ key: 'r', className: 'selection-curve', shape: resistanceCurve(z.re) });
  }
  if (Number.isFinite(z.im) && Number.isFinite(z.re)) {
    curves.push({ key: 'x', className: 'selection-curve', shape: reactanceCurve(z.im, 0, Infinity) });
  }
  return (
    <g className="selection-overlay" aria-hidden="true">
      {curves.map((c) => (
        <path key={c.key} className={c.className} d={shapeToPath(c.shape)} />
      ))}
    </g>
  );
}
