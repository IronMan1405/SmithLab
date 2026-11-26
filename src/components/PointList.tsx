import { impedanceFromReflection } from '../core';
import type { ResolvedPoint } from '../workspace';
import { formatComplex, formatNumber } from './format';

interface PointListProps {
  readonly points: readonly ResolvedPoint[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onClear: () => void;
}

/** Plotted points, with points derived from each one nested beneath it. */
export function PointList({ points, selectedId, onSelect, onClear }: PointListProps) {
  const childrenOf = (id: string) => points.filter((p) => p.sourceId === id);

  const renderRow = (p: ResolvedPoint, depth: number) => (
    <li key={p.id}>
      <button
        type="button"
        className={[p.id === selectedId ? 'selected' : '', p.role].join(' ').trim()}
        style={{ paddingLeft: 8 + depth * 14 }}
        aria-pressed={p.id === selectedId}
        onClick={() => onSelect(p.id)}
      >
        <span className="name">
          {p.role === 'derived' && <span className="nest" aria-hidden="true">↳ </span>}
          {p.name}
        </span>
        <span className="value">
          {p.transform?.type === 'line' ? `${formatNumber(p.transform.length)}λ · ` : ''}z = {formatComplex(impedanceFromReflection(p.gamma), 3)}
        </span>
      </button>
      {childrenOf(p.id).length > 0 && <ul>{childrenOf(p.id).map((c) => renderRow(c, depth + 1))}</ul>}
    </li>
  );

  const roots = points.filter((p) => p.role === 'source');

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
      {points.length === 0 ? <p className="hint">No points yet.</p> : <ul>{roots.map((p) => renderRow(p, 0))}</ul>}
    </section>
  );
}
