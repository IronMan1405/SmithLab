import { impedanceFromReflection } from '../core';
import type { WorkspacePoint } from '../workspace';
import { formatComplex } from './format';

interface PointListProps {
  readonly points: readonly WorkspacePoint[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onClear: () => void;
}

export function PointList({ points, selectedId, onSelect, onClear }: PointListProps) {
  return (
    <section className="point-list" aria-label="Points">
      <div className="section-head">
        <h2>Points ({points.length})</h2>
        <button
          type="button"
          className="link danger"
          disabled={points.length === 0}
          onClick={() => {
            if (window.confirm(`Remove all ${points.length} point${points.length === 1 ? '' : 's'}?`)) onClear();
          }}
        >
          Clear all
        </button>
      </div>
      {points.length === 0 ? (
        <p className="hint">No points yet.</p>
      ) : (
        <ul>
          {points.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={p.id === selectedId ? 'selected' : undefined}
                aria-pressed={p.id === selectedId}
                onClick={() => onSelect(p.id)}
              >
                <span className="name">{p.name}</span>
                <span className="value">z = {formatComplex(impedanceFromReflection(p.gamma), 3)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
