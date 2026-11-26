import { type Complex, abs, impedanceFromReflection } from '../core';
import { gammaToSvg, reactanceCurve, reflectionMagnitudeCircle, resistanceCurve } from '../geometry';
import { shapeToPath } from './svg-path';

interface CursorOverlayProps {
  /** Reflection coefficient under the pointer; must satisfy |Γ| < 1. */
  readonly gamma: Complex;
}

/**
 * Read-only inspection aid: the constant-r circle, constant-x arc and
 * constant-|Γ| circle passing through the point under the pointer.
 */
export function CursorOverlay({ gamma }: CursorOverlayProps) {
  const z = impedanceFromReflection(gamma);
  const p = gammaToSvg(gamma);
  return (
    <g className="cursor-overlay" aria-hidden="true">
      <path className="cursor-vswr" d={shapeToPath(reflectionMagnitudeCircle(abs(gamma)))} />
      <path className="cursor-curve" d={shapeToPath(resistanceCurve(z.re))} />
      <path className="cursor-curve" d={shapeToPath(reactanceCurve(z.im, 0, Infinity))} />
      <circle className="cursor-point" cx={p.x} cy={p.y} r={7} />
    </g>
  );
}
