/**
 * Workspace state: plotted points, derived points, selection and the
 * reference impedance.
 *
 * Points are stored by their reflection coefficient Γ — the chart's own
 * coordinate — and every electrical quantity is derived from Γ and Z₀ by the
 * core engine (see `quantities.ts`). Changing Z₀ therefore keeps each point
 * where it is on the chart (same Γ, same normalised z) and re-derives its
 * physical impedance Z = z·Z₀.
 *
 * Derived points (see `derived.ts`) store a source id and a transform, never
 * a Γ; their Γ is recomputed from the source whenever it is needed.
 *
 * Expressions are stored only as their text (plus enabled/visible/slider
 * flags); values, types, dependencies and plot positions are derived by the
 * expression engine (`src/expressions`) and never stored here.
 *
 * Invariants maintained by the reducer:
 *   - every point (plotted or derived) has a unique, stable string id;
 *   - every plotted point satisfies |Γ| ≤ 1 (derived points inherit this,
 *     since lossless lines preserve |Γ|);
 *   - every derived point's source exists (deleting a point deletes its
 *     dependents);
 *   - `selectedId` is null or the id of an existing point (plotted, derived)
 *     or expression;
 *   - Z₀ is a finite positive number.
 */
import { type Complex, DEFAULT_Z0, assertComplex, assertReferenceImpedance } from '../core';
import { CURVE_COLORS, type CurveColor, type ExpressionDef, type SliderSpec, assertSlider, createExpressionDef } from '../expressions';
import { type DerivedPoint, dependentsOf, findDerived, pointExists, resolveGamma, transformTowards } from './derived';
import { clampToDisc } from './disc';

export interface WorkspacePoint {
  readonly id: string;
  readonly name: string;
  readonly gamma: Complex;
}

export interface WorkspaceState {
  /** Plotted (independent) points. */
  readonly points: readonly WorkspacePoint[];
  /** Points derived from others by a transformation. */
  readonly derived: readonly DerivedPoint[];
  /** Expressions, in panel order. */
  readonly expressions: readonly ExpressionDef[];
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
  | {
      readonly type: 'line/add';
      readonly id: string;
      readonly sourceId: string;
      readonly length: number;
      readonly name?: string;
    }
  | { readonly type: 'line/set-length'; readonly id: string; readonly length: number }
  | { readonly type: 'expression/add'; readonly id: string; readonly text?: string; readonly afterId?: string | null }
  | { readonly type: 'expression/set-text'; readonly id: string; readonly text: string }
  | { readonly type: 'expression/remove'; readonly id: string }
  | { readonly type: 'expression/set-enabled'; readonly id: string; readonly enabled: boolean }
  | { readonly type: 'expression/set-visible'; readonly id: string; readonly visible: boolean }
  | { readonly type: 'expression/set-slider'; readonly id: string; readonly slider: SliderSpec | null }
  | { readonly type: 'expression/set-color'; readonly id: string; readonly color: CurveColor | null }
  | { readonly type: 'points/clear' }
  | { readonly type: 'z0/set'; readonly z0: number };

export const MAX_NAME_LENGTH = 40;

export function createWorkspace(z0: number = DEFAULT_Z0): WorkspaceState {
  assertReferenceImpedance(z0);
  return { points: [], derived: [], expressions: [], selectedId: null, z0, nextNumber: 1 };
}

function normalizeName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'point/create': {
      assertComplex(action.gamma, 'reflection coefficient');
      if (idInUse(state, action.id)) {
        throw new Error(`Duplicate point id "${action.id}"`);
      }
      const name = normalizeName(action.name ?? '') || `P${state.nextNumber}`;
      const point: WorkspacePoint = { id: action.id, name, gamma: clampToDisc(action.gamma) };
      return { ...state, points: [...state.points, point], selectedId: point.id, nextNumber: state.nextNumber + 1 };
    }
    case 'point/move': {
      assertComplex(action.gamma, 'reflection coefficient');
      const derived = findDerived(state, action.id);
      if (derived) return moveDerived(state, derived, action.gamma);
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
      if (action.id !== null && !pointExists(state, action.id) && !expressionExists(state, action.id)) return state;
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id };
    }
    case 'point/rename': {
      const name = normalizeName(action.name);
      if (!name) return state; // Empty names are rejected; the old name is kept.
      return {
        ...state,
        points: state.points.map((p) => (p.id === action.id ? { ...p, name } : p)),
        derived: state.derived.map((p) => (p.id === action.id ? { ...p, name } : p)),
      };
    }
    case 'point/delete': {
      if (!pointExists(state, action.id)) return state;
      // Deleting a point also deletes everything derived from it.
      const removed = new Set([action.id, ...dependentsOf(state, action.id)]);
      return {
        ...state,
        points: state.points.filter((p) => !removed.has(p.id)),
        derived: state.derived.filter((p) => !removed.has(p.id)),
        selectedId: state.selectedId !== null && removed.has(state.selectedId) ? null : state.selectedId,
      };
    }
    case 'line/add': {
      assertLength(action.length);
      if (idInUse(state, action.id)) throw new Error(`Duplicate point id "${action.id}"`);
      if (!pointExists(state, action.sourceId)) throw new Error(`Unknown source point "${action.sourceId}"`);
      const sourceName = state.points.find((p) => p.id === action.sourceId)?.name ?? findDerived(state, action.sourceId)?.name;
      const point: DerivedPoint = {
        id: action.id,
        name: normalizeName(action.name ?? '') || `${sourceName ?? 'P'} in`,
        sourceId: action.sourceId,
        transform: { type: 'line', length: action.length },
      };
      return { ...state, derived: [...state.derived, point], selectedId: point.id };
    }
    case 'line/set-length': {
      assertLength(action.length);
      const target = findDerived(state, action.id);
      if (!target || target.transform.type !== 'line' || target.transform.length === action.length) return state;
      return replaceDerived(state, { ...target, transform: { type: 'line', length: action.length } });
    }
    case 'points/clear': {
      // Clears plotted and derived points only; expressions are kept.
      const keepSelection = state.selectedId !== null && expressionExists(state, state.selectedId);
      return { ...state, points: [], derived: [], selectedId: keepSelection ? state.selectedId : null };
    }
    case 'expression/add': {
      if (idInUse(state, action.id)) throw new Error(`Duplicate id "${action.id}"`);
      const def = createExpressionDef(action.id, action.text ?? '');
      const after = action.afterId ? state.expressions.findIndex((e) => e.id === action.afterId) : -1;
      const expressions =
        after < 0
          ? [...state.expressions, def]
          : [...state.expressions.slice(0, after + 1), def, ...state.expressions.slice(after + 1)];
      return { ...state, expressions };
    }
    case 'expression/set-text':
      return updateExpression(state, action.id, (e) => (e.text === action.text ? e : { ...e, text: action.text }));
    case 'expression/set-enabled':
      return updateExpression(state, action.id, (e) => (e.enabled === action.enabled ? e : { ...e, enabled: action.enabled }));
    case 'expression/set-visible':
      return updateExpression(state, action.id, (e) => (e.visible === action.visible ? e : { ...e, visible: action.visible }));
    case 'expression/set-slider':
      if (action.slider) assertSlider(action.slider);
      return updateExpression(state, action.id, (e) => ({ ...e, slider: action.slider }));
    case 'expression/set-color':
      if (action.color !== null && !CURVE_COLORS.includes(action.color)) throw new RangeError(`Unknown colour "${action.color}"`);
      return updateExpression(state, action.id, (e) => (e.color === action.color ? e : { ...e, color: action.color }));
    case 'expression/remove': {
      if (!expressionExists(state, action.id)) return state;
      return {
        ...state,
        expressions: state.expressions.filter((e) => e.id !== action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      };
    }
    case 'z0/set':
      assertReferenceImpedance(action.z0);
      return { ...state, z0: action.z0 };
  }
}

/** The selected *plotted* point, or null (also null when a derived point is selected). */
export function selectedPoint(state: WorkspaceState): WorkspacePoint | null {
  return state.points.find((p) => p.id === state.selectedId) ?? null;
}

function assertLength(length: number): void {
  if (typeof length !== 'number' || !Number.isFinite(length)) {
    throw new RangeError(`Line length must be a finite number of wavelengths (got ${String(length)})`);
  }
}

export function expressionExists(state: WorkspaceState, id: string): boolean {
  return state.expressions.some((e) => e.id === id);
}

function idInUse(state: WorkspaceState, id: string): boolean {
  return pointExists(state, id) || expressionExists(state, id);
}

function updateExpression(state: WorkspaceState, id: string, fn: (e: ExpressionDef) => ExpressionDef): WorkspaceState {
  let changed = false;
  const expressions = state.expressions.map((e) => {
    if (e.id !== id) return e;
    const next = fn(e);
    if (next !== e) changed = true;
    return next;
  });
  return changed ? { ...state, expressions } : state;
}

function replaceDerived(state: WorkspaceState, next: DerivedPoint): WorkspaceState {
  return { ...state, derived: state.derived.map((p) => (p.id === next.id ? next : p)) };
}

/**
 * A derived point cannot be placed freely: moving it toward `target`
 * changes its transform parameter instead (for a line, the length that
 * rotates the source's Γ toward the target), so the dependency is kept.
 */
function moveDerived(state: WorkspaceState, point: DerivedPoint, target: Complex): WorkspaceState {
  const sourceGamma = resolveGamma(state, point.sourceId);
  if (!sourceGamma) return state;
  const transform = transformTowards(sourceGamma, point.transform, target);
  if (!transform || transform.length === point.transform.length) return state;
  return replaceDerived(state, { ...point, transform });
}

let idCounter = 0;

/** Stable unique point id. Independent of array position and of the display name. */
export function createPointId(): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `pt-${Date.now().toString(36)}-${idCounter.toString(36)}-${random}`;
}
