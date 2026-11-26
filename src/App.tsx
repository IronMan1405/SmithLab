import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { SmithChart } from './chart/SmithChart';
import { DEFAULT_VIEW, type View, pixelsPerSvgUnit, zoomAbout } from './chart/viewport';
import { HoverStatus } from './components/HoverStatus';
import { PointList } from './components/PointList';
import { NEW_LINE_LENGTH, SelectionPanel } from './components/SelectionPanel';
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

  const [workspace, dispatch] = useReducer(workspaceReducer, undefined, () => createWorkspace());
  const [view, setView] = useState<View>(DEFAULT_VIEW);

  const svgRef = useRef<SVGSVGElement>(null);
  const size = useElementSize(svgRef);
  const unitsPerPixel = size.width > 0 && size.height > 0 ? 1 / pixelsPerSvgUnit({ left: 0, top: 0, ...size }, view) : 0;

  // Every point with its current Γ; derived points are recomputed from their sources.
  const resolved = useMemo(() => resolvePoints(workspace), [workspace]);
  const selected = useMemo(
    () => (workspace.selectedId ? resolvePoint(workspace, workspace.selectedId) : null),
    [workspace],
  );
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

  const interaction = useChartInteraction({ svgRef, view, points: resolved, onCommand: applyCommand });
  useKeyboardShortcuts({ selected, view }, applyCommand);

  const focusPoint = useCallback((id: string) => dispatch({ type: 'point/select', id }), []);
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
        <div className="chart-frame">
          <SmithChart
            ref={svgRef}
            view={view}
            unitsPerPixel={unitsPerPixel}
            showImpedanceGrid={showImpedanceGrid}
            showAdmittanceGrid={showAdmittanceGrid}
            showWavelengthScales={showWavelengthScales}
            points={resolved}
            lines={lines}
            selectedId={workspace.selectedId}
            selection={quantities}
            selectionOnLinePath={selectionOnLinePath}
            gestureKind={interaction.gestureKind}
            onFocusPoint={focusPoint}
            pointerHandlers={interaction.handlers}
          />
          {workspace.points.length === 0 && (
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
