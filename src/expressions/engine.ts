/**
 * Reactive evaluation of a list of expressions.
 *
 * 1. Parse each expression (memoised by text).
 * 2. Bind names: each enabled, valid `name = …` defines `name`. A name
 *    defined more than once is an error on every definition; constants
 *    (`pi`, `π`, `j`) cannot be reassigned.
 * 3. Build the dependency graph from referenced names and detect cycles
 *    (every expression on a cycle reports the cycle path).
 * 4. Evaluate in a deterministic topological order (ties broken by list
 *    order). An unresolved or failing dependency produces an error on the
 *    dependent; it never stops the others.
 * 5. Incremental: given the previous output, an expression's previous result
 *    object is reused when its text, enabled state, name bindings and all of
 *    its dependencies' results are unchanged, and Z₀ is unchanged or unused.
 *    `recomputed` lists what was actually evaluated.
 */
import type { Complex } from '../core';
import type { Curve } from '../geometry/curves';
import { type Span, referencedNames } from './ast';
import type { ExpressionDef } from './definitions';
import { EvaluationError, type ErrorKind, evaluate } from './evaluator';
import { CONSTANTS, isReservedName } from './functions';
import { parseCached } from './parser';
import { type PlotResult, plotValue } from './plot';
import { type Value, applyDeclaredType, isCurve } from './types';

export interface ExpressionError {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly span: Span | null;
}

export type ExpressionStatus = 'ok' | 'error' | 'disabled' | 'empty';

export interface ExpressionResult {
  readonly id: string;
  /** Name defined by this expression, if any (even when it has an error). */
  readonly name: string | null;
  readonly status: ExpressionStatus;
  /** Scalar result (null for curves and failures). */
  readonly value: import('./types').TypedValue | null;
  /** Curve result (null for scalars and failures). */
  readonly curve: Curve | null;
  readonly error: ExpressionError | null;
  /** Variable names this expression references (constants excluded). */
  readonly dependencies: readonly string[];
  readonly plot: PlotResult | null;
  /** Internal: inputs this result was computed from (for reuse). */
  readonly signature: string;
  readonly usesZ0: boolean;
}

export interface EvaluationOutput {
  readonly z0: number;
  /** Results keyed by expression id, in list order. */
  readonly results: ReadonlyMap<string, ExpressionResult>;
  /** Ids evaluated in this pass (the rest were reused from `previous`). */
  readonly recomputed: ReadonlySet<string>;
  /** Evaluation order (ids). */
  readonly order: readonly string[];
}

interface Entry {
  readonly def: ExpressionDef;
  readonly index: number;
  readonly name: string | null;
  readonly deps: readonly string[];
  /** Static error found before evaluation (syntax, naming, cycle). */
  error: ExpressionError | null;
  readonly empty: boolean;
  readonly body: import('./ast').Node | null;
}

function staticEntries(defs: readonly ExpressionDef[]): Entry[] {
  return defs.map((def, index) => {
    const parsed = parseCached(def.text);
    if (!parsed.ok) {
      return {
        def,
        index,
        name: null,
        deps: [],
        empty: parsed.empty,
        body: null,
        error: parsed.empty ? null : { kind: 'syntax', message: parsed.message, span: parsed.span },
      };
    }
    const deps = [...referencedNames(parsed.statement.body)].filter((n) => !(n in CONSTANTS));
    return { def, index, name: parsed.statement.name, deps, empty: false, body: parsed.statement.body, error: null };
  });
}

/** Tarjan's strongly connected components; returns, per id, the cycle it belongs to (if any). */
function findCycles(entries: readonly Entry[], edges: ReadonlyMap<string, readonly string[]>): Map<string, string[]> {
  const indexOf = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles = new Map<string, string[]>();
  let counter = 0;

  const visit = (v: string) => {
    indexOf.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!indexOf.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, indexOf.get(w)!));
      }
    }
    if (low.get(v) === indexOf.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      const selfLoop = (edges.get(v) ?? []).includes(v);
      if (component.length > 1 || selfLoop) for (const id of component) cycles.set(id, component);
    }
  };

  for (const e of entries) if (!indexOf.has(e.def.id)) visit(e.def.id);
  return cycles;
}

function cyclePath(start: string, members: readonly string[], edges: ReadonlyMap<string, readonly string[]>, nameOf: (id: string) => string): string {
  const inCycle = new Set(members);
  const path = [start];
  let current = start;
  for (let i = 0; i < members.length; i++) {
    const next = (edges.get(current) ?? []).find((w) => inCycle.has(w));
    if (!next) break;
    path.push(next);
    if (next === start) break;
    current = next;
  }
  return path.map(nameOf).join(' → ');
}

export function evaluateExpressions(
  defs: readonly ExpressionDef[],
  z0: number,
  previous: EvaluationOutput | null = null,
): EvaluationOutput {
  const entries = staticEntries(defs);
  const byId = new Map(entries.map((e) => [e.def.id, e]));

  // --- name binding ---------------------------------------------------------
  const definers = new Map<string, Entry[]>();
  const disabledNames = new Set<string>();
  for (const e of entries) {
    if (!e.name || e.error) continue;
    if (!e.def.enabled) {
      disabledNames.add(e.name);
      continue;
    }
    if (isReservedName(e.name)) {
      e.error = { kind: 'name', message: `"${e.name}" is a built-in constant and cannot be redefined`, span: null };
      continue;
    }
    definers.set(e.name, [...(definers.get(e.name) ?? []), e]);
  }
  const nameToId = new Map<string, string>();
  for (const [name, list] of definers) {
    if (list.length === 1) nameToId.set(name, list[0]!.def.id);
    else for (const e of list) e.error = { kind: 'name', message: `"${name}" is defined ${list.length} times`, span: null };
  }

  // --- dependency graph and cycles ----------------------------------------------
  const edges = new Map<string, string[]>();
  for (const e of entries) {
    if (!e.def.enabled || e.error || e.empty) continue;
    edges.set(e.def.id, e.deps.map((n) => nameToId.get(n)).filter((id): id is string => id !== undefined));
  }
  const cycles = findCycles(entries, edges);
  const nameOf = (id: string) => byId.get(id)?.name ?? '?';
  for (const [id, members] of cycles) {
    byId.get(id)!.error = {
      kind: 'cycle',
      message: `Circular dependency: ${cyclePath(id, members, edges, nameOf)}`,
      span: null,
    };
  }

  // --- deterministic topological order ------------------------------------------
  const order: string[] = [];
  const placed = new Set<string>();
  const place = (id: string) => {
    if (placed.has(id)) return;
    placed.add(id);
    if (!cycles.has(id)) for (const dep of edges.get(id) ?? []) place(dep);
    order.push(id);
  };
  for (const e of entries) place(e.def.id);

  // --- evaluation -----------------------------------------------------------------
  const results = new Map<string, ExpressionResult>();
  const recomputed = new Set<string>();

  for (const id of order) {
    const e = byId.get(id)!;
    const boundDeps = e.deps.map((n) => `${n}:${nameToId.get(n) ?? (disabledNames.has(n) ? '#disabled' : '#undefined')}`);
    const signature = `${e.def.enabled ? 1 : 0}|${e.def.text}|${e.error?.message ?? ''}|${boundDeps.join(',')}`;

    const prev = previous?.results.get(id);
    const reusable =
      prev !== undefined &&
      prev.signature === signature &&
      (previous!.z0 === z0 || !prev.usesZ0) &&
      e.deps.every((n) => {
        const depId = nameToId.get(n);
        return depId === undefined || results.get(depId) === previous!.results.get(depId);
      });
    if (reusable) {
      results.set(id, prev);
      continue;
    }

    recomputed.add(id);
    results.set(id, evaluateEntry(e, signature, z0, nameToId, disabledNames, results));
  }

  // Present results in list order.
  const ordered = new Map<string, ExpressionResult>();
  for (const e of entries) ordered.set(e.def.id, results.get(e.def.id)!);
  return { z0, results: ordered, recomputed, order };
}

function evaluateEntry(
  e: Entry,
  signature: string,
  z0: number,
  nameToId: ReadonlyMap<string, string>,
  disabledNames: ReadonlySet<string>,
  results: ReadonlyMap<string, ExpressionResult>,
): ExpressionResult {
  const base = { id: e.def.id, name: e.name, dependencies: e.deps, signature };
  const none = { value: null, curve: null, plot: null } as const;
  if (e.empty) return { ...base, ...none, status: 'empty', error: null, usesZ0: false };
  if (!e.def.enabled) return { ...base, ...none, status: 'disabled', error: null, usesZ0: false };
  if (e.error || !e.body) return { ...base, ...none, status: 'error', error: e.error, usesZ0: false };

  let usesZ0 = false;
  const ctx = {
    z0,
    noteZ0: () => {
      usesZ0 = true;
    },
    lookup: (name: string, span: Span): Value => {
      const depId = nameToId.get(name);
      if (!depId) {
        throw new EvaluationError(
          'reference',
          disabledNames.has(name) ? `"${name}" is disabled` : `"${name}" is not defined`,
          span,
        );
      }
      const dep = results.get(depId);
      if (!dep || dep.status !== 'ok' || (!dep.value && !dep.curve)) {
        throw new EvaluationError('dependency', `"${name}" has an error`, span);
      }
      if (dep.usesZ0) usesZ0 = true;
      return dep.value ?? { type: 'curve', curve: dep.curve! };
    },
  };

  try {
    let value: Value = evaluate(e.body, ctx);
    if (e.name) {
      try {
        value = applyDeclaredType(e.name, value);
      } catch (error) {
        if (error instanceof Error) throw new EvaluationError('type', error.message, null);
        throw error;
      }
    }
    if (isCurve(value)) {
      return { ...base, status: 'ok', value: null, curve: value.curve, error: null, plot: null, usesZ0 };
    }
    const plot = plotValue(value, ctx);
    return { ...base, status: 'ok', value, curve: null, error: null, plot, usesZ0 };
  } catch (error) {
    if (error instanceof EvaluationError) {
      return { ...base, ...none, status: 'error', error: { kind: error.kind, message: error.message, span: error.span }, usesZ0 };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ...base, ...none, status: 'error', error: { kind: 'math', message, span: null }, usesZ0 };
  }
}

/** Physical Γ of the load a successfully plotted expression represents, or null. */
export function plottedGamma(result: ExpressionResult | undefined): Complex | null {
  return result?.status === 'ok' && result.plot?.kind === 'point' ? result.plot.gamma : null;
}

/** Canonical chart position and frame of a plotted expression, or null (see geometry/chart-mode.ts). */
export function plottedPosition(
  result: ExpressionResult | undefined,
): { readonly position: Complex; readonly frame: 'number' | 'plane' } | null {
  return result?.status === 'ok' && result.plot?.kind === 'point'
    ? { position: result.plot.position, frame: result.plot.frame }
    : null;
}

/** Ids of expressions that reference `name` (directly). */
export function directDependents(output: EvaluationOutput, name: string): string[] {
  return [...output.results.values()].filter((r) => r.dependencies.includes(name)).map((r) => r.id);
}
