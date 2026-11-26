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

interface SelectionPanelProps {
  readonly workspace: WorkspaceState;
  readonly selected: ResolvedPoint;
  readonly onSelect: (id: string) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onAddLine: (sourceId: string) => void;
  readonly onSetLength: (id: string, length: number) => void;
}

function wtg(point: ResolvedPoint): string {
  const value = wavelengthsTowardGenerator(point.gamma);
  return value === null ? '— (Γ = 0)' : `${formatNumber(value)}λ`;
}

/** Contextual property panel for the selected point (plotted load or line input). */
export function SelectionPanel({ workspace, selected, ...actions }: SelectionPanelProps) {
  const quantities = pointQuantities(selected.gamma, workspace.z0);
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
    </PointInspector>
  );
}
