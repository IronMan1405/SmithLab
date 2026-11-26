import { type Complex, admittanceFromReflection, impedanceFromReflection } from '../core';
import { CURVE_COLORS, type CurveColor } from '../expressions';
import type { Curve, IntersectionResult } from '../geometry';
import { formatComplex, formatNumber } from './format';
import { QuantityList } from './PointInspector';

export interface CurveIntersections {
  readonly otherId: string;
  /** Expression name, if the other curve can be referenced in expressions. */
  readonly otherName: string | null;
  /** Display label of the other curve. */
  readonly otherLabel: string;
  readonly result: IntersectionResult;
}

interface CurveInspectorProps {
  readonly name: string | null;
  readonly text: string;
  readonly curve: Curve;
  readonly color: CurveColor;
  readonly onColor: (color: CurveColor) => void;
  readonly probeT: number;
  readonly onProbe: (t: number) => void;
  readonly intersections: readonly CurveIntersections[];
  /** Key `${otherId}#${index}` of the highlighted intersection. */
  readonly activeIntersection: string | null;
  readonly onActivateIntersection: (key: string | null) => void;
  readonly onAddIntersectionPoint: (otherName: string, index: number) => void;
  readonly onEdit: () => void;
}

function pointRows(gamma: Complex): [string, string][] {
  return [
    ['Γ', formatComplex(gamma)],
    ['z', formatComplex(impedanceFromReflection(gamma))],
    ['y', formatComplex(admittanceFromReflection(gamma))],
  ];
}

/** Inspector for an expression-defined curve: definition, parameters, a probe, and intersections. */
export function CurveInspector(props: CurveInspectorProps) {
  const { curve } = props;
  const { min, max, name: paramName, unit } = curve.parameter;
  const probe = curve.point(props.probeT);
  const step = (max - min) / 1000;

  return (
    <section className="inspector expression curve-inspector" aria-label="Curve properties">
      <div className="inspector-head">
        <span className="curve-swatch" style={{ background: `var(--curve-${props.color})` }} aria-hidden="true" />
        <span className="name-static">{props.name ?? 'Unnamed curve'}</span>
      </div>

      <div className="defined-by">
        <span className="defined-by-label">Defined by expression · {curve.label}</span>
        <code>{props.text}</code>
        <button type="button" className="link expr-link" onClick={props.onEdit}>
          Edit in expression panel
        </button>
      </div>

      <h3 className="quantities-heading">Parameters</h3>
      <QuantityList rows={curve.properties.map((p) => [p.label, p.value] as const)} />

      <div className="colour-row" role="radiogroup" aria-label="Curve colour">
        {CURVE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={props.color === c}
            aria-label={c}
            className={props.color === c ? 'colour active' : 'colour'}
            style={{ background: `var(--curve-${c})` }}
            onClick={() => props.onColor(c)}
          />
        ))}
      </div>

      <h3 className="quantities-heading">Point on curve</h3>
      <div className="probe">
        <label className="probe-label">
          {paramName} = {formatNumber(props.probeT)}
          {unit}
        </label>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={props.probeT}
          aria-label={`Curve parameter ${paramName}`}
          onChange={(e) => props.onProbe(Number(e.target.value))}
        />
        {probe ? (
          <QuantityList rows={pointRows(probe)} />
        ) : (
          <p className="hint">The curve is undefined at this parameter value.</p>
        )}
      </div>

      <h3 className="quantities-heading">Intersections with visible curves</h3>
      {props.intersections.length === 0 ? (
        <p className="hint">No other visible curves.</p>
      ) : (
        <ul className="intersection-list">
          {props.intersections.map(({ otherId, otherName, otherLabel, result }) => (
            <li key={otherId}>
              <div className="intersection-with">with {otherLabel}</div>
              {result.coincident && <p className="hint">The curves coincide.</p>}
              {!result.coincident && result.points.length === 0 && (
                <p className="hint">
                  No intersection
                  {result.closestApproach !== null && ` — closest approach ${formatNumber(result.closestApproach)} in Γ`}
                </p>
              )}
              {result.points.map((p, i) => {
                const key = `${otherId}#${i}`;
                return (
                  <div
                    key={key}
                    className={props.activeIntersection === key ? 'intersection active' : 'intersection'}
                    onMouseEnter={() => props.onActivateIntersection(key)}
                    onMouseLeave={() => props.onActivateIntersection(null)}
                  >
                    <button
                      type="button"
                      className="intersection-select"
                      onClick={() => props.onActivateIntersection(props.activeIntersection === key ? null : key)}
                    >
                      #{i + 1}
                      {p.tangent && <span className="tag">tangent</span>}
                      {p.numerical && <span className="tag">numerical</span>}
                    </button>
                    <span className="intersection-value">Γ {formatComplex(p.gamma, 4)}</span>
                    <span className="intersection-value">z {formatComplex(impedanceFromReflection(p.gamma), 4)}</span>
                    <button
                      type="button"
                      className="link expr-link"
                      disabled={!props.name || !otherName}
                      title={
                        props.name && otherName
                          ? 'Add this intersection as a point expression'
                          : 'Only named expression curves can be referenced (use radial(…) for an expression guide)'
                      }
                      onClick={() => otherName && props.onAddIntersectionPoint(otherName, i + 1)}
                    >
                      + point
                    </button>
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
