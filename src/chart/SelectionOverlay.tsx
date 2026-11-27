import { type Complex, abs } from '../core';
import {
  type ChartMode,
  type Shape,
  activeGridReading,
  conductanceCurve,
  reactanceCurve,
  reflectionMagnitudeCircle,
  resistanceCurve,
  susceptanceCurve,
} from '../geometry';
import { shapeToPath } from './svg-path';

interface SelectionOverlayProps {
  /** Displayed position of the selected point. */
  readonly display: Complex;
  readonly mode: ChartMode;
  /** Omit the |Γ| circle when a transmission-line path already shows it. */
  readonly showVswrCircle: boolean;
}

/**
 * The active grid's two curves through the selected point (constant r and x
 * in impedance mode, constant g and b in admittance mode) and the
 * constant-|Γ| circle. Degenerate cases (open/short, matched) omit the
 * curves that don't exist.
 */
export function SelectionOverlay({ display, mode, showVswrCircle }: SelectionOverlayProps) {
  const curves: { key: string; className: string; shape: Shape }[] = [];
  const magnitude = abs(display);
  if (showVswrCircle && magnitude > 0 && magnitude < 1) {
    curves.push({ key: 'vswr', className: 'selection-vswr', shape: reflectionMagnitudeCircle(magnitude) });
  }
  const w = activeGridReading(display, mode);
  if (Number.isFinite(w.re) && Number.isFinite(w.im)) {
    const real = mode === 'impedance' ? resistanceCurve : conductanceCurve;
    const imag = mode === 'impedance' ? reactanceCurve : susceptanceCurve;
    if (w.re > 0) curves.push({ key: 're', className: 'selection-curve', shape: real(w.re) });
    curves.push({ key: 'im', className: 'selection-curve', shape: imag(w.im, 0, Infinity) });
  }
  return (
    <g className="selection-overlay" aria-hidden="true">
      {curves.map((c) => (
        <path key={c.key} className={c.className} d={shapeToPath(c.shape)} />
      ))}
    </g>
  );
}
