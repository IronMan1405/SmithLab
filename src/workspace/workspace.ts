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
import type { ChartMode } from '../geometry/chart-mode';
import {
  type DerivedPoint,
  type RadialGuide,
  dependentsOf,
  findDerived,
  pointExists,
  resolveGamma,
  transformTowards,
} from './derived';
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
  /** Radial guides attached to points or expressions. */
  readonly guides: readonly RadialGuide[];
  /**
   * Active chart coordinate system. A view setting: it decides where
   * z/y/Z values are drawn, never their values (see geometry/chart-mode.ts).
   * Independent of which grids are visible.
   */
  readonly chartMode: ChartMode;
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
  | { readonly type: 'guide/add'; readonly id: string; readonly sourceId: string }
  | { readonly type: 'guide/set-visible'; readonly id: string; readonly visible: boolean }
  | { readonly type: 'chart/set-mode'; readonly mode: ChartMode }
  | { readonly type: 'points/clear' }
  | { readonly type: 'z0/set'; readonly z0: number };

export const MAX_NAME_LENGTH = 40;

export function createWorkspace(z0: number = DEFAULT_Z0): WorkspaceState {
  assertReferenceImpedance(z0);
  return { points: [], derived: [], expressions: [], guides: [], chartMode: 'impedance', selectedId: null, z0, nextNumber: 1 };
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
      if (action.id !== null && !idInUse(state, action.id)) return state;
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
      if (guideExists(state, action.id)) {
        return withoutGuides(state, new Set([action.id]));
      }
      if (!pointExists(state, action.id)) return state;
      // Deleting a point also deletes everything derived from it, and their guides.
      const removed = new Set([action.id, ...dependentsOf(state, action.id)]);
      return withoutGuidesOf(
        {
          ...state,
          points: state.points.filter((p) => !removed.has(p.id)),
          derived: state.derived.filter((p) => !removed.has(p.id)),
          selectedId: state.selectedId !== null && removed.has(state.selectedId) ? null : state.selectedId,
        },
        removed,
      );
    }
    case 'guide/add': {
      if (idInUse(state, action.id)) throw new Error(`Duplicate id "${action.id}"`);
      if (!pointExists(state, action.sourceId) && !expressionExists(state, action.sourceId)) {
        throw new Error(`Unknown source "${action.sourceId}"`);
      }
      const guide: RadialGuide = { id: action.id, sourceId: action.sourceId, visible: true };
      return { ...state, guides: [...state.guides, guide], selectedId: guide.id };
    }
    case 'chart/set-mode':
      if (action.mode !== 'impedance' && action.mode !== 'admittance') throw new RangeError(`Unknown chart mode "${String(action.mode)}"`);
      return state.chartMode === action.mode ? state : { ...state, chartMode: action.mode };
    case 'guide/set-visible':
      return {
        ...state,
        guides: state.guides.map((g) => (g.id === action.id && g.visible !== action.visible ? { ...g, visible: action.visible } : g)),
      };
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
      // Clears plotted and derived points (and their guides); expressions are kept.
      const removed = new Set([...state.points.map((p) => p.id), ...state.derived.map((p) => p.id)]);
      const cleared = withoutGuidesOf({ ...state, points: [], derived: [] }, removed);
      const keep =
        cleared.selectedId !== null && (expressionExists(cleared, cleared.selectedId) || guideExists(cleared, cleared.selectedId));
      return { ...cleared, selectedId: keep ? cleared.selectedId : null };
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
      return withoutGuidesOf(
        {
          ...state,
          expressions: state.expressions.filter((e) => e.id !== action.id),
          selectedId: state.selectedId === action.id ? null : state.selectedId,
        },
        new Set([action.id]),
      );
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

export function guideExists(state: WorkspaceState, id: string): boolean {
  return state.guides.some((g) => g.id === id);
}

function idInUse(state: WorkspaceState, id: string): boolean {
  return pointExists(state, id) || expressionExists(state, id) || guideExists(state, id);
}

function withoutGuides(state: WorkspaceState, ids: ReadonlySet<string>): WorkspaceState {
  if (!state.guides.some((g) => ids.has(g.id))) return state;
  return {
    ...state,
    guides: state.guides.filter((g) => !ids.has(g.id)),
    selectedId: state.selectedId !== null && ids.has(state.selectedId) ? null : state.selectedId,
  };
}

/** Remove guides whose source is one of `sourceIds`. */
function withoutGuidesOf(state: WorkspaceState, sourceIds: ReadonlySet<string>): WorkspaceState {
  return withoutGuides(state, new Set(state.guides.filter((g) => sourceIds.has(g.sourceId)).map((g) => g.id)));
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
