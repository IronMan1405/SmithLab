import type { Curve } from '../geometry';
import { QuantityList } from './PointInspector';

interface GuideInspectorProps {
  readonly sourceName: string;
  readonly curve: Curve | null;
  readonly visible: boolean;
  readonly onSelectSource: () => void;
  readonly onSetVisible: (visible: boolean) => void;
  readonly onDelete: () => void;
}

/** Inspector for a radial guide construction. */
export function GuideInspector({ sourceName, curve, visible, ...actions }: GuideInspectorProps) {
  return (
    <section className="inspector guide-inspector" aria-label="Radial guide">
      <div className="inspector-head">
        <span className="guide-swatch" aria-hidden="true" />
        <span className="name-static">Radial guide</span>
        <button type="button" className="danger" onClick={actions.onDelete} title="Delete guide (Delete)">
          Delete
        </button>
      </div>
      <div className="defined-by">
        <span className="defined-by-label">From the chart centre through</span>
        <button type="button" className="link guide-link" onClick={actions.onSelectSource}>
          {sourceName}
        </button>
        <span className="defined-by-label">to the boundary. Follows the point when it moves.</span>
      </div>
      <label className="toggle guide-visible">
        <input type="checkbox" checked={visible} onChange={(e) => actions.onSetVisible(e.target.checked)} />
        Show on chart
      </label>
      {curve ? (
        <>
          <h3 className="quantities-heading">Angle</h3>
          <QuantityList rows={curve.properties.map((p) => [p.label, p.value] as const)} />
        </>
      ) : (
        <p className="hint">The guide is undefined: its point is at the chart centre (Γ = 0) or currently has no position.</p>
      )}
    </section>
  );
}
