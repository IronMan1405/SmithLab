/**
 * Geometry of a lossless-line transformation in the Γ-plane.
 *
 * Along a lossless line Γ keeps its magnitude and rotates about the origin,
 * so the locus is the constant-|Γ| (constant-VSWR) circle through the load.
 * The arc from load to input sweeps −4πd radians: clockwise for positive d
 * (toward the generator).
 */
import { type Complex, abs, arg, complex, reflectionThroughLine } from '../core';
import { type CircleShape, type Shape, ZERO_CENTER } from './shapes';
import { reflectionMagnitudeCircle } from './vswr-circles';

/** Full constant-|Γ| circle traced by the line's input point; null for a matched load. */
export function linePathCircle(gammaLoad: Complex): CircleShape | null {
  const radius = abs(gammaLoad);
  return radius > 0 ? reflectionMagnitudeCircle(radius) : null;
}

export interface DirectedPath {
  /** Arc (or full circle when |d| ≥ ½λ) from the load Γ to the input Γ. */
  readonly shape: Shape;
  readonly start: Complex;
  readonly end: Complex;
  /** Unit vector (Γ-plane) of the direction of travel at `end`. */
  readonly tangent: Complex;
  /** Number of complete revolutions contained in the path. */
  readonly turns: number;
}

/**
 * The directed arc travelled by Γ from the load through a line of
 * `length` wavelengths. Null for a matched load or zero length.
 */
export function lineTransformationArc(gammaLoad: Complex, length: number): DirectedPath | null {
  const radius = abs(gammaLoad);
  if (!(radius > 0) || length === 0) return null;
  const end = reflectionThroughLine(gammaLoad, length);
  const sweep = -4 * Math.PI * length;
  const turns = Math.floor(Math.abs(length) / 0.5);
  const theta = arg(end);
  const clockwise = sweep < 0;
  const tangent = clockwise ? complex(Math.sin(theta), -Math.cos(theta)) : complex(-Math.sin(theta), Math.cos(theta));
  const shape: Shape =
    Math.abs(sweep) >= 2 * Math.PI
      ? { kind: 'circle', center: ZERO_CENTER, radius }
      : { kind: 'arc', center: ZERO_CENTER, radius, start: gammaLoad, end, startAngle: arg(gammaLoad), sweep };
  return { shape, start: gammaLoad, end, tangent, turns };
}
