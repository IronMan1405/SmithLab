/**
 * Workspace state: plotted points, selection and the reference impedance.
 *
 * Points are stored by their reflection coefficient Γ — the chart's own
 * coordinate — and every electrical quantity is derived from Γ and Z₀ by the
 * core engine (see `quantities.ts`). Changing Z₀ therefore keeps each point
 * where it is on the chart (same Γ, same normalised z) and re-derives its
 * physical impedance Z = z·Z₀.
 *
 * Invariants maintained by the reducer:
 *   - every point has a unique, stable string id (never an array index);
 *   - every point satisfies |Γ| ≤ 1;
 *   - `selectedId` is null or the id of an existing point;
 *   - Z₀ is a finite positive number.
 */
import { type Complex, DEFAULT_Z0, assertComplex, assertReferenceImpedance } from '../core';
import { clampToDisc } from './disc';

export interface WorkspacePoint {
  readonly id: string;
  readonly name: string;
  readonly gamma: Complex;
}

export interface WorkspaceState {
  readonly points: readonly WorkspacePoint[];
  readonly selectedId: string | null;
  readonly z0: number;
  /** Next number used for default names (P1, P2, …). Never reused. */
  readonly nextNumber: number;
}

export type WorkspaceAction =
  | { readonly type: 'point/create'; readonly id: string; readonly gamma: Complex; readonly name?: string }
  | { readonly type: 'point/move'; readonly id: string; readonly gamma: Complex }
  | { readonly type: 'point/select'; readonly id: string | null }
  | { readonly type: 'point/rename'; readonly id: string; readonly name: string }
  | { readonly type: 'point/delete'; readonly id: string }
  | { readonly type: 'points/clear' }
  | { readonly type: 'z0/set'; readonly z0: number };

export const MAX_NAME_LENGTH = 40;

export function createWorkspace(z0: number = DEFAULT_Z0): WorkspaceState {
  assertReferenceImpedance(z0);
  return { points: [], selectedId: null, z0, nextNumber: 1 };
}

function normalizeName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'point/create': {
      assertComplex(action.gamma, 'reflection coefficient');
      if (state.points.some((p) => p.id === action.id)) {
        throw new Error(`Duplicate point id "${action.id}"`);
      }
      const name = normalizeName(action.name ?? '') || `P${state.nextNumber}`;
      const point: WorkspacePoint = { id: action.id, name, gamma: clampToDisc(action.gamma) };
      return { ...state, points: [...state.points, point], selectedId: point.id, nextNumber: state.nextNumber + 1 };
    }
    case 'point/move': {
      assertComplex(action.gamma, 'reflection coefficient');
      const gamma = clampToDisc(action.gamma);
      let changed = false;
      const points = state.points.map((p) => {
        if (p.id !== action.id) return p;
        changed = true;
        return { ...p, gamma };
      });
      return changed ? { ...state, points } : state;
    }
    case 'point/select': {
      if (action.id !== null && !state.points.some((p) => p.id === action.id)) return state;
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id };
    }
    case 'point/rename': {
      const name = normalizeName(action.name);
      if (!name) return state; // Empty names are rejected; the old name is kept.
      return { ...state, points: state.points.map((p) => (p.id === action.id ? { ...p, name } : p)) };
    }
    case 'point/delete': {
      if (!state.points.some((p) => p.id === action.id)) return state;
      return {
        ...state,
        points: state.points.filter((p) => p.id !== action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      };
    }
    case 'points/clear':
      return { ...state, points: [], selectedId: null };
    case 'z0/set':
      assertReferenceImpedance(action.z0);
      return { ...state, z0: action.z0 };
  }
}

export function selectedPoint(state: WorkspaceState): WorkspacePoint | null {
  return state.points.find((p) => p.id === state.selectedId) ?? null;
}

let idCounter = 0;

/** Stable unique point id. Independent of array position and of the display name. */
export function createPointId(): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `pt-${Date.now().toString(36)}-${idCounter.toString(36)}-${random}`;
}
