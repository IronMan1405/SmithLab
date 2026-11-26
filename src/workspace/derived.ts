/**
 * Derived (dependent) points.
 *
 * A derived point owns no Γ of its own. It references a source point by
 * stable id and applies a transformation to the source's *current* Γ, so it
 * follows every change of its source automatically.
 *
 * Chains: `sourceId` may name either a plotted point or another derived
 * point, so a sequence of operations (line → series element → line …) is a
 * chain of derived points, each holding one transform. Milestone 3A creates
 * only single transmission-line transforms on plotted points, but nothing
 * here needs to change to support longer chains or new transform types.
 */
import {
  type Complex,
  abs,
  assertComplex,
  electricalLengthBetween,
  nearestEquivalentLength,
  reflectionThroughLine,
} from '../core';
import type { WorkspaceState } from './workspace';

/** Lossless line with Z₀ equal to the workspace Z₀; `length` in wavelengths toward the generator. */
export interface LineTransform {
  readonly type: 'line';
  readonly length: number;
}

/** Union of supported operations. Future: series/shunt elements, lossy lines. */
export type PointTransform = LineTransform;

export interface DerivedPoint {
  readonly id: string;
  readonly name: string;
  readonly sourceId: string;
  readonly transform: PointTransform;
}

/** `expression`: a point plotted from an expression result (see src/expressions). */
export type PointRole = 'source' | 'derived' | 'expression';

/** A point of either kind with its Γ resolved — what renderers and inspectors consume. */
export interface ResolvedPoint {
  readonly id: string;
  readonly name: string;
  readonly role: PointRole;
  readonly gamma: Complex;
  readonly sourceId: string | null;
  readonly transform: PointTransform | null;
}

export function applyTransform(gamma: Complex, transform: PointTransform): Complex {
  switch (transform.type) {
    case 'line':
      return reflectionThroughLine(gamma, transform.length);
  }
}

/**
 * Inverse of a drag on a derived point: the transform that places the
 * point as close as possible to `target`. For a line this is the length
 * whose rotation points Γ toward `target`, chosen continuous with the
 * current length so dragging past ½λ keeps increasing. Returns null when
 * the target direction is undefined (Γ = 0) — the point then stays put.
 */
export function transformTowards(sourceGamma: Complex, current: PointTransform, target: Complex): PointTransform | null {
  assertComplex(target, 'target reflection coefficient');
  switch (current.type) {
    case 'line': {
      const d = electricalLengthBetween(sourceGamma, target);
      if (d === null) return null;
      return { type: 'line', length: nearestEquivalentLength(d, current.length) };
    }
  }
}

export function findDerived(state: WorkspaceState, id: string): DerivedPoint | undefined {
  return state.derived.find((p) => p.id === id);
}

export function pointExists(state: WorkspaceState, id: string): boolean {
  return state.points.some((p) => p.id === id) || state.derived.some((p) => p.id === id);
}

/** Current Γ of any point, following derived points back to their plotted source. */
export function resolveGamma(state: WorkspaceState, id: string): Complex | null {
  const visited = new Set<string>();
  const walk = (pointId: string): Complex | null => {
    if (visited.has(pointId)) return null; // defensive: cycles cannot be created by the reducer
    visited.add(pointId);
    const source = state.points.find((p) => p.id === pointId);
    if (source) return source.gamma;
    const derived = findDerived(state, pointId);
    if (!derived) return null;
    const upstream = walk(derived.sourceId);
    return upstream ? applyTransform(upstream, derived.transform) : null;
  };
  return walk(id);
}

export function resolvePoint(state: WorkspaceState, id: string): ResolvedPoint | null {
  const source = state.points.find((p) => p.id === id);
  if (source) return { id, name: source.name, role: 'source', gamma: source.gamma, sourceId: null, transform: null };
  const derived = findDerived(state, id);
  const gamma = derived ? resolveGamma(state, id) : null;
  if (!derived || !gamma) return null;
  return { id, name: derived.name, role: 'derived', gamma, sourceId: derived.sourceId, transform: derived.transform };
}

/** All points (plotted first, then derived) with their current Γ. */
export function resolvePoints(state: WorkspaceState): ResolvedPoint[] {
  const ids = [...state.points.map((p) => p.id), ...state.derived.map((p) => p.id)];
  return ids.map((id) => resolvePoint(state, id)).filter((p): p is ResolvedPoint => p !== null);
}

/** Ids of every point that depends on `id`, directly or through a chain. */
export function dependentsOf(state: WorkspaceState, id: string): string[] {
  const result: string[] = [];
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const d of state.derived) {
      if (d.sourceId === current && !result.includes(d.id)) {
        result.push(d.id);
        queue.push(d.id);
      }
    }
  }
  return result;
}

/** True when Γ of the source is zero, so any line leaves it unchanged. */
export function isRotationInvariant(gamma: Complex): boolean {
  return abs(gamma) === 0;
}
