import { formatNumber } from './format';
import { LineControls } from './LineControls';
import { PointInspector, QuantityList, quantityRows } from './PointInspector';
import {
  type ResolvedPoint,
  type WorkspaceState,
  pointQuantities,
  resolvePoint,
  resolvePoints,
} from '../workspace';
import { wavelengthsTowardGenerator } from '../geometry';

/** Default length for a newly added line: λ/8, so the input point is visibly separate. */
export const NEW_LINE_LENGTH = 0.125;

/** Details of the expression behind a selected expression point. */
export interface ExpressionInfo {
  readonly text: string;
  readonly typeLabel: string;
  /** A literal point that can be dragged on the chart. */
  readonly draggable: boolean;
}

interface SelectionPanelProps {
  readonly workspace: WorkspaceState;
  readonly selected: ResolvedPoint;
  readonly expression: ExpressionInfo | null;
  readonly onEditExpression: (id: string) => void;
  readonly onSelect: (id: string) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onAddLine: (sourceId: string) => void;
  readonly onSetLength: (id: string, length: number) => void;
  readonly onAddGuide: (sourceId: string) => void;
  /** Expression points: add a transmission line as new expressions (null reason = allowed). */
  readonly expressionLine: { readonly onAdd: () => void; readonly disabledReason: string | null } | null;
}

/** "Radial guide" action plus links to the point's existing guides. */
function GuideActions({ workspace, sourceId, onAdd, onSelect }: { workspace: WorkspaceState; sourceId: string; onAdd: () => void; onSelect: (id: string) => void }) {
  const guides = workspace.guides.filter((g) => g.sourceId === sourceId);
  return (
    <div className="guide-actions">
      <button type="button" className="secondary" onClick={onAdd} title="Line from the chart centre through this point to the boundary">
        + Radial guide
      </button>
      {guides.map((g, i) => (
        <button key={g.id} type="button" className="link guide-link" onClick={() => onSelect(g.id)}>
          ↳ radial guide{guides.length > 1 ? ` ${i + 1}` : ''}
          {g.visible ? '' : ' (hidden)'}
        </button>
      ))}
    </div>
  );
}

function wtg(point: ResolvedPoint): string {
  const value = wavelengthsTowardGenerator(point.gamma);
  return value === null ? '— (Γ = 0)' : `${formatNumber(value)}λ`;
}

/** Contextual property panel for the selected point (plotted load or line input). */
export function SelectionPanel({ workspace, selected, expression, ...actions }: SelectionPanelProps) {
  // Readouts describe the load the point represents (physical Γ), not where it is drawn.
  const quantities = pointQuantities(selected.physicalGamma ?? selected.gamma, workspace.z0);

  if (selected.role === 'expression') {
    return (
      <PointInspector point={selected} quantities={quantities} z0={workspace.z0} quantitiesHeading="Plotted value">
        {expression && (
          <div className="defined-by">
            <span className="defined-by-label">Defined by expression · {expression.typeLabel}</span>
            <code>{expression.text}</code>
            <span className="defined-by-label">
              {expression.draggable
                ? 'Drag the point on the chart to edit this value.'
                : 'Computed from other expressions — not draggable. Edit the expression instead.'}
            </span>
            <button type="button" className="link expr-link" onClick={() => actions.onEditExpression(selected.id)}>
              Edit in expression panel
            </button>
          </div>
        )}
        <div className="operations">
          {actions.expressionLine && (
            <button
              type="button"
              className="primary"
              disabled={actions.expressionLine.disabledReason !== null}
              title={actions.expressionLine.disabledReason ?? 'Adds a length variable (with slider) and a line() expression'}
              onClick={actions.expressionLine.onAdd}
            >
              + Add transmission line
            </button>
          )}
          {actions.expressionLine?.disabledReason && <p className="hint">{actions.expressionLine.disabledReason}</p>}
          <GuideActions workspace={workspace} sourceId={selected.id} onAdd={() => actions.onAddGuide(selected.id)} onSelect={actions.onSelect} />
        </div>
      </PointInspector>
    );
  }

  const lines = resolvePoints(workspace).filter((p) => p.sourceId === selected.id);

  if (selected.role === 'source') {
    return (
      <PointInspector
        point={selected}
        quantities={quantities}
        z0={workspace.z0}
        quantitiesHeading="Load"
        onRename={(name) => actions.onRename(selected.id, name)}
        onDelete={() => actions.onDelete(selected.id)}
        deleteTitle={lines.length > 0 ? `Delete point and its ${lines.length} line(s) (Delete)` : 'Delete point (Delete)'}
      >
        <div className="operations">
          <button type="button" className="primary" onClick={() => actions.onAddLine(selected.id)}>
            + Add transmission line
          </button>
          {lines.length > 0 && (
            <ul className="derived-links">
              {lines.map((line) => (
                <li key={line.id}>
                  <button type="button" className="link" onClick={() => actions.onSelect(line.id)}>
                    ↳ {line.name}
                    {line.transform?.type === 'line' && ` · ${formatNumber(line.transform.length)}λ`}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <GuideActions workspace={workspace} sourceId={selected.id} onAdd={() => actions.onAddGuide(selected.id)} onSelect={actions.onSelect} />
        </div>
      </PointInspector>
    );
  }

  const source = selected.sourceId ? resolvePoint(workspace, selected.sourceId) : null;
  const length = selected.transform?.type === 'line' ? selected.transform.length : 0;
  const sourceQuantities = source ? pointQuantities(source.gamma, workspace.z0) : null;

  return (
    <PointInspector
      point={selected}
      quantities={quantities}
      z0={workspace.z0}
      quantitiesHeading="Input"
      extraRows={[
        ['Length', `${formatNumber(length)}λ`, 'Electrical length toward the generator'],
        ['WTG', wtg(selected), 'Wavelengths-toward-generator scale reading at the input'],
      ]}
      onRename={(name) => actions.onRename(selected.id, name)}
      footer={
        source &&
        sourceQuantities && (
          <div className="load-summary">
            <h3 className="quantities-heading">
              Load ·{' '}
              <button type="button" className="link" onClick={() => actions.onSelect(source.id)}>
                {source.name}
              </button>
            </h3>
            <QuantityList
              rows={[
                ...quantityRows(sourceQuantities, workspace.z0, 'ʟ').slice(0, 4),
                ['WTG', wtg(source), 'Wavelengths-toward-generator scale reading at the load'],
              ]}
            />
          </div>
        )
      }
    >
      <LineControls
        length={length}
        onChange={(value) => actions.onSetLength(selected.id, value)}
        onRemove={() => actions.onDelete(selected.id)}
      />
      <div className="operations">
        <GuideActions workspace={workspace} sourceId={selected.id} onAdd={() => actions.onAddGuide(selected.id)} onSelect={actions.onSelect} />
      </div>
    </PointInspector>
  );
}
