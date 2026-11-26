/**
 * Constant-VSWR (constant |Γ|) circles: centred on Γ = 0 with radius
 * |Γ| = (VSWR − 1)/(VSWR + 1).
 */
import { ZERO, reflectionMagnitudeFromVswr } from '../core';
import type { CircleShape } from './shapes';

export function vswrCircle(vswr: number): CircleShape {
  return { kind: 'circle', center: ZERO, radius: reflectionMagnitudeFromVswr(vswr) };
}

export function reflectionMagnitudeCircle(magnitude: number): CircleShape {
  if (Number.isNaN(magnitude) || magnitude < 0 || !Number.isFinite(magnitude)) {
    throw new RangeError(`|Γ| must be finite and ≥ 0 (got ${magnitude})`);
  }
  return { kind: 'circle', center: ZERO, radius: magnitude };
}
