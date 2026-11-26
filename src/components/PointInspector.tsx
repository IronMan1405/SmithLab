import { useEffect, useState } from 'react';
import type { LoadKind, PointQuantities, WorkspacePoint } from '../workspace';
import { formatComplex, formatNumber } from './format';

interface PointInspectorProps {
  readonly point: WorkspacePoint;
  readonly quantities: PointQuantities;
  readonly z0: number;
  readonly onRename: (name: string) => void;
  readonly onDelete: () => void;
}

const KIND_LABEL: Record<LoadKind, string | null> = {
  matched: 'Matched load',
  short: 'Short circuit',
  open: 'Open circuit',
  lossless: 'Lossless (|Γ| = 1)',
  general: null,
};

function NameField({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    if (draft.trim()) onRename(draft);
    else setDraft(name);
  };
  return (
    <input
      className="name-field"
      aria-label="Point name"
      value={draft}
      maxLength={40}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(name);
          // Blur after the reset has rendered so commit() sees the original name.
          const input = e.target as HTMLInputElement;
          requestAnimationFrame(() => input.blur());
        }
      }}
    />
  );
}

export function PointInspector({ point, quantities: q, z0, onRename, onDelete }: PointInspectorProps) {
  const kind = KIND_LABEL[q.kind];
  const phase = Number.isNaN(q.gammaPhaseDeg) ? '— (undefined at Γ = 0)' : `${formatNumber(q.gammaPhaseDeg)}°`;
  const rows: readonly [string, string, string?][] = [
    ['z', formatComplex(q.z), 'Normalised impedance r + jx'],
    ['Z', `${formatComplex(q.impedance)} Ω`, `Physical impedance at Z₀ = ${formatNumber(z0)} Ω`],
    ['Γ', formatComplex(q.gamma), 'Reflection coefficient'],
    ['|Γ|', formatNumber(q.gammaMagnitude)],
    ['∠Γ', phase],
    ['VSWR', formatNumber(q.vswr)],
    ['Return loss', `${formatNumber(q.returnLossDb)} dB`],
    ['y', formatComplex(q.y), 'Normalised admittance g + jb'],
  ];

  return (
    <section className="inspector" aria-label={`Properties of ${point.name}`}>
      <div className="inspector-head">
        <span className="selected-swatch" aria-hidden="true" />
        <NameField name={point.name} onRename={onRename} />
        <button type="button" className="danger" onClick={onDelete} title="Delete point (Delete)">
          Delete
        </button>
      </div>
      {kind && <p className="kind-badge">{kind}</p>}
      <dl className="quantities">
        {rows.map(([term, value, title]) => (
          <div key={term} className="row" title={title}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
