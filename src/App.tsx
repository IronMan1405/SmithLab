import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { SmithChart } from './chart/SmithChart';
import { DEFAULT_VIEW, type View, pixelsPerSvgUnit, zoomAbout } from './chart/viewport';
import { HoverStatus } from './components/HoverStatus';
import { PointList } from './components/PointList';
import { ExpressionPanel } from './components/ExpressionPanel';
import { type ExpressionInfo, NEW_LINE_LENGTH, SelectionPanel } from './components/SelectionPanel';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { ViewControls } from './components/ViewControls';
import { Z0Control } from './components/Z0Control';
import { useTheme } from './components/useTheme';
import { KEY_ZOOM_FACTOR, type KeyCommand } from './interaction/keyboard';
import { useChartInteraction } from './interaction/useChartInteraction';
import { useElementSize } from './interaction/useElementSize';
import { useKeyboardShortcuts } from './interaction/useKeyboardShortcuts';
import type { LineVisual } from './chart/TransmissionLineLayer';
import {
  type EvaluationOutput,
  TYPE_INFO,
  evaluateExpressions,
  plottedGamma,
  withSliderValue,
} from './expressions';
import type { ResolvedPoint } from './workspace';
import {
  createPointId,
  createWorkspace,
  pointQuantities,
  resolveGamma,
  resolvePoint,
  resolvePoints,
  workspaceReducer,
} from './workspace';
import './App.css';

export function App() {
  const [themePreference, , setThemePreference] = useTheme();
  const [showImpedanceGrid, setShowImpedanceGrid] = useState(true);
  const [showAdmittanceGrid, setShowAdmittanceGrid] = useState(false);
  const [showWavelengthScales, setShowWavelengthScales] = useState(true);
  const [showExpressions, setShowExpressions] = useState(true);
  const [focusExpressionId, setFocusExpressionId] = useState<string | null>(null);

  const [workspace, dispatch] = useReducer(workspaceReducer, undefined, () => createWorkspace());
  const [view, setView] = useState<View>(DEFAULT_VIEW);

  const svgRef = useRef<SVGSVGElement>(null);
  const size = useElementSize(svgRef);
  const unitsPerPixel = size.width > 0 && size.height > 0 ? 1 / pixelsPerSvgUnit({ left: 0, top: 0, ...size }, view) : 0;

  // Every point with its current Γ; derived points are recomputed from their sources.
  const resolved = useMemo(() => resolvePoints(workspace), [workspace]);

  // Expressions: re-evaluated reactively. The previous output is passed back
  // in so unchanged expressions (and everything that depends only on them)
  // are reused rather than recomputed.
  const evaluationCache = useRef<EvaluationOutput | null>(null);
  const evaluation = useMemo(() => {
    const output = evaluateExpressions(workspace.expressions, workspace.z0, evaluationCache.current);
    evaluationCache.current = output;
    return output;
  }, [workspace.expressions, workspace.z0]);

  const expressionPoints = useMemo<ResolvedPoint[]>(() => {
    const result: ResolvedPoint[] = [];
    for (const def of workspace.expressions) {
      const r = evaluation.results.get(def.id);
      const gamma = plottedGamma(r);
      if (!def.visible || !gamma || !r) continue;
      result.push({ id: def.id, name: r.name ?? def.text, role: 'expression', gamma, sourceId: null, transform: null });
    }
    return result;
  }, [workspace.expressions, evaluation]);

  /** Everything drawn on (and hit-testable in) the chart. */
  const chartPoints = useMemo(() => [...resolved, ...expressionPoints], [resolved, expressionPoints]);

  const selected = useMemo(
    () =>
      workspace.selectedId
        ? (resolvePoint(workspace, workspace.selectedId) ?? expressionPoints.find((p) => p.id === workspace.selectedId) ?? null)
        : null,
    [workspace, expressionPoints],
  );
  const selectedExpression = useMemo<ExpressionInfo | null>(() => {
    if (selected?.role !== 'expression') return null;
    const def = workspace.expressions.find((e) => e.id === selected.id);
    const value = evaluation.results.get(selected.id)?.value;
    return def && value ? { text: def.text, typeLabel: TYPE_INFO[value.type].label } : null;
  }, [selected, workspace.expressions, evaluation]);
  const quantities = useMemo(
    () => (selected ? pointQuantities(selected.gamma, workspace.z0) : null),
    [selected, workspace.z0],
  );

  const lines = useMemo<LineVisual[]>(() => {
    const result: LineVisual[] = [];
    for (const d of workspace.derived) {
      const loadGamma = resolveGamma(workspace, d.sourceId);
      if (!loadGamma || d.transform.type !== 'line') continue;
      const emphasized = workspace.selectedId === d.id || workspace.selectedId === d.sourceId;
      result.push({ id: d.id, loadGamma, length: d.transform.length, emphasized });
    }
    return result;
  }, [workspace]);
  const selectionOnLinePath = lines.some((l) => l.emphasized);

  /** Single place where interaction commands become state changes. */
  const applyCommand = useCallback((command: KeyCommand) => {
    switch (command.type) {
      case 'create':
        dispatch({ type: 'point/create', id: createPointId(), gamma: command.gamma });
        break;
      case 'select':
        dispatch({ type: 'point/select', id: command.id });
        break;
      case 'deselect':
        dispatch({ type: 'point/select', id: null });
        break;
      case 'move':
        dispatch({ type: 'point/move', id: command.id, gamma: command.gamma });
        break;
      case 'delete':
        dispatch({ type: 'point/delete', id: command.id });
        break;
      case 'line-length':
        dispatch({ type: 'line/set-length', id: command.id, length: command.length });
        break;
      case 'view':
        setView(command.view);
        break;
    }
  }, []);

  const interaction = useChartInteraction({ svgRef, view, points: chartPoints, onCommand: applyCommand });
  useKeyboardShortcuts({ selected, view }, applyCommand);

  const focusPoint = useCallback((id: string) => dispatch({ type: 'point/select', id }), []);

  const addExpression = useCallback((afterId: string | null, text = '') => {
    const id = createPointId();
    dispatch({ type: 'expression/add', id, text, afterId });
    setFocusExpressionId(id);
    return id;
  }, []);

  const insertExample = useCallback(() => {
    const ids = EXAMPLE.map(({ text }) => {
      const id = createPointId();
      dispatch({ type: 'expression/add', id, text });
      return id;
    });
    EXAMPLE.forEach((line, i) => {
      if (line.hidden) dispatch({ type: 'expression/set-visible', id: ids[i]!, visible: false });
      if (line.slider) dispatch({ type: 'expression/set-slider', id: ids[i]!, slider: line.slider });
    });
  }, []);

  const setSliderValue = useCallback(
    (id: string, value: number) => {
      const def = workspace.expressions.find((e) => e.id === id);
      if (!def?.slider) return;
      const text = withSliderValue(def.text, value, def.slider.step);
      if (text) dispatch({ type: 'expression/set-text', id, text });
    },
    [workspace.expressions],
  );
  const showHover = interaction.gestureKind === 'idle' ? interaction.hover : null;

  return (
    <div className="workspace">
      <header className="toolbar">
        <h1 className="brand">
          Smith<span>Lab</span>
        </h1>
        <div className="toolbar-group">
          <label className="toggle">
            <input type="checkbox" checked={showImpedanceGrid} onChange={(e) => setShowImpedanceGrid(e.target.checked)} />
            <span className="swatch swatch-z" /> Impedance grid
          </label>
          <label className="toggle">
            <input type="checkbox" checked={showAdmittanceGrid} onChange={(e) => setShowAdmittanceGrid(e.target.checked)} />
            <span className="swatch swatch-y" /> Admittance grid
          </label>
          <label className="toggle">
            <input type="checkbox" checked={showExpressions} onChange={(e) => setShowExpressions(e.target.checked)} />
            Expressions
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showWavelengthScales}
              onChange={(e) => setShowWavelengthScales(e.target.checked)}
            />
            λ scales
          </label>
        </div>
        <Z0Control value={workspace.z0} onChange={(z0) => dispatch({ type: 'z0/set', z0 })} />
        <ThemeSwitcher value={themePreference} onChange={setThemePreference} />
      </header>

      <main className="stage">
        {showExpressions && (
          <aside className="expressions-sidebar">
            <ExpressionPanel
              expressions={workspace.expressions}
              evaluation={evaluation}
              selectedId={workspace.selectedId}
              focusId={focusExpressionId}
              onAdd={(afterId) => addExpression(afterId)}
              onChangeText={(id, text) => dispatch({ type: 'expression/set-text', id, text })}
              onRemove={(id) => dispatch({ type: 'expression/remove', id })}
              onSetEnabled={(id, enabled) => dispatch({ type: 'expression/set-enabled', id, enabled })}
              onSetVisible={(id, visible) => dispatch({ type: 'expression/set-visible', id, visible })}
              onSetSlider={(id, slider) => dispatch({ type: 'expression/set-slider', id, slider })}
              onSliderValue={setSliderValue}
              onSelect={focusPoint}
              onInsertExample={insertExample}
              onFocusHandled={() => setFocusExpressionId(null)}
            />
          </aside>
        )}
        <div className="chart-frame">
          <SmithChart
            ref={svgRef}
            view={view}
            unitsPerPixel={unitsPerPixel}
            showImpedanceGrid={showImpedanceGrid}
            showAdmittanceGrid={showAdmittanceGrid}
            showWavelengthScales={showWavelengthScales}
            points={chartPoints}
            lines={lines}
            selectedId={workspace.selectedId}
            selection={quantities}
            selectionOnLinePath={selectionOnLinePath}
            gestureKind={interaction.gestureKind}
            onFocusPoint={focusPoint}
            pointerHandlers={interaction.handlers}
          />
          {workspace.points.length === 0 && workspace.expressions.length === 0 && (
            <p className="chart-hint">Click inside the chart to place an impedance point. Drag to pan, scroll to zoom.</p>
          )}
          <HoverStatus gamma={showHover} />
          <ViewControls
            view={view}
            onZoomIn={() => setView((v) => zoomAbout(v, v.center, KEY_ZOOM_FACTOR))}
            onZoomOut={() => setView((v) => zoomAbout(v, v.center, 1 / KEY_ZOOM_FACTOR))}
            onFit={() => setView(DEFAULT_VIEW)}
          />
        </div>

        <aside className="sidebar">
          {selected ? (
            <SelectionPanel
              key={selected.id}
              workspace={workspace}
              selected={selected}
              expression={selectedExpression}
              onEditExpression={(id) => {
                setShowExpressions(true);
                setFocusExpressionId(id);
              }}
              onSelect={focusPoint}
              onRename={(id, name) => dispatch({ type: 'point/rename', id, name })}
              onDelete={(id) => dispatch({ type: 'point/delete', id })}
              onAddLine={(sourceId) =>
                dispatch({ type: 'line/add', id: createPointId(), sourceId, length: NEW_LINE_LENGTH })
              }
              onSetLength={(id, length) => dispatch({ type: 'line/set-length', id, length })}
            />
          ) : (
            <section className="inspector empty">
              <h2>Inspector</h2>
              <p className="hint">
                {workspace.points.length === 0
                  ? 'Click anywhere inside the chart to create a point.'
                  : 'Select a point to inspect its electrical quantities.'}
              </p>
            </section>
          )}

          <PointList
            points={resolved}
            selectedId={workspace.selectedId}
            onSelect={focusPoint}
            onClear={() => dispatch({ type: 'points/clear' })}
          />

          <details className="shortcuts">
            <summary>Controls</summary>
            <dl>
              <dt>Click chart</dt><dd>Add point</dd>
              <dt>Drag point</dt><dd>Move (snaps to match/short/open; hold Alt to disable)</dd>
              <dt>Drag background</dt><dd>Pan (or middle-drag)</dd>
              <dt>Scroll / pinch</dt><dd>Zoom at cursor</dd>
              <dt>Arrows</dt><dd>Nudge selected (Shift ×10); on a line input, change length by 0.001λ</dd>
              <dt>Drag line input</dt><dd>Slide along its |Γ| circle (changes length)</dd>
              <dt>Delete</dt><dd>Delete selected</dd>
              <dt>Esc</dt><dd>Deselect</dd>
              <dt>+ / − / 0</dt><dd>Zoom in / out / fit</dd>
              <dt>Tab</dt><dd>Cycle through points</dd>
            </dl>
          </details>
        </aside>
      </main>
    </div>
  );
}

/** Example from the Milestone 3B brief: a load seen through a line whose length is a slider. */
const EXAMPLE: readonly { text: string; hidden?: boolean; slider?: { min: number; max: number; step: number } }[] = [
  { text: 'zL = 0.5 + j1.2' },
  { text: 'yL = 1/zL' },
  { text: 'gammaL = (zL - 1)/(zL + 1)', hidden: true },
  { text: 'l = 0.125', slider: { min: 0, max: 0.5, step: 0.001 } },
  { text: 'gammaIn = gammaL * exp(-j*4*pi*l)' },
];
