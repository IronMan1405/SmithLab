import { type ReactNode, useEffect, useState } from 'react';
import type { LoadKind, PointQuantities, ResolvedPoint } from '../workspace';
import { formatComplex, formatNumber } from './format';

interface PointInspectorProps {
  readonly point: ResolvedPoint;
  readonly quantities: PointQuantities;
  readonly z0: number;
  /** Heading for the quantities block, e.g. "Load" or "Input". */
  readonly quantitiesHeading: string;
  /** Extra rows appended to the quantities list. */
  readonly extraRows?: readonly (readonly [string, string, string?])[];
  /** When omitted the name is shown read-only. */
  readonly onRename?: (name: string) => void;
  /** When given, a Delete button is shown in the header. */
  readonly onDelete?: () => void;
  readonly deleteTitle?: string;
  /** Contextual controls shown between the header and the quantities. */
  readonly children?: ReactNode;
  /** Content shown after the quantities. */
  readonly footer?: ReactNode;
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

/** Standard rows for a point's electrical quantities (all values from the core engine). */
export function quantityRows(q: PointQuantities, z0: number, subscript = ''): [string, string, string?][] {
  const phase = Number.isNaN(q.gammaPhaseDeg) ? '— (undefined at Γ = 0)' : `${formatNumber(q.gammaPhaseDeg)}°`;
  return [
    [`z${subscript}`, formatComplex(q.z), 'Normalised impedance r + jx'],
    [`Z${subscript}`, `${formatComplex(q.impedance)} Ω`, `Physical impedance at Z₀ = ${formatNumber(z0)} Ω`],
    [`Γ${subscript}`, formatComplex(q.gamma), 'Reflection coefficient'],
    [`|Γ${subscript}|`, formatNumber(q.gammaMagnitude)],
    [`∠Γ${subscript}`, phase],
    ['VSWR', formatNumber(q.vswr)],
    ['Return loss', `${formatNumber(q.returnLossDb)} dB`],
    [`y${subscript}`, formatComplex(q.y), 'Normalised admittance g + jb'],
  ];
}

export function QuantityList({ rows }: { rows: readonly (readonly [string, string, string?])[] }) {
  return (
    <dl className="quantities">
      {rows.map(([term, value, title]) => (
        <div key={term} className="row" title={title}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PointInspector(props: PointInspectorProps) {
  const { point, quantities: q, z0 } = props;
  const kind = KIND_LABEL[q.kind];
  const derived = point.role === 'derived';
  const subscript = derived ? 'ᵢₙ' : '';
  const swatch = derived ? 'selected-swatch diamond' : point.role === 'expression' ? 'selected-swatch square' : 'selected-swatch';
  const rows = [...quantityRows(q, z0, subscript), ...(props.extraRows ?? [])];

  return (
    <section className={`inspector ${point.role}`} aria-label={`Properties of ${point.name}`}>
      <div className="inspector-head">
        <span className={swatch} aria-hidden="true" />
        {props.onRename ? (
          <NameField name={point.name} onRename={props.onRename} />
        ) : (
          <span className="name-static">{point.name}</span>
        )}
        {props.onDelete && (
          <button type="button" className="danger" onClick={props.onDelete} title={props.deleteTitle}>
            Delete
          </button>
        )}
      </div>
      {props.children}
      <h3 className="quantities-heading">
        {props.quantitiesHeading}
        {kind && <span className="kind-badge">{kind}</span>}
      </h3>
      <QuantityList rows={rows} />
      {props.footer}
    </section>
  );
}
