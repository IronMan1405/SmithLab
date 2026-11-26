import { useEffect, useRef } from 'react';
import {
  type EvaluationOutput,
  type ExpressionDef,
  type ExpressionResult,
  type SliderSpec,
  TYPE_INFO,
  defaultSlider,
  sliderLiteral,
} from '../expressions';
import { formatTypedValue } from './formatValue';

export interface ExpressionPanelActions {
  readonly onAdd: (afterId: string | null) => void;
  readonly onChangeText: (id: string, text: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onSetEnabled: (id: string, enabled: boolean) => void;
  readonly onSetVisible: (id: string, visible: boolean) => void;
  readonly onSetSlider: (id: string, slider: SliderSpec | null) => void;
  readonly onSliderValue: (id: string, value: number) => void;
  readonly onSelect: (id: string) => void;
  readonly onInsertExample: () => void;
  readonly onFocusHandled: () => void;
}

interface ExpressionPanelProps extends ExpressionPanelActions {
  readonly expressions: readonly ExpressionDef[];
  readonly evaluation: EvaluationOutput;
  readonly selectedId: string | null;
  /** Expression whose input should receive focus (e.g. just added). */
  readonly focusId: string | null;
}

/** Desmos-style list of expressions. All evaluation happens in src/expressions. */
export function ExpressionPanel(props: ExpressionPanelProps) {
  const { expressions, evaluation } = props;
  return (
    <section className="expression-panel" aria-label="Expressions">
      <div className="section-head">
        <h2>Expressions</h2>
        <button type="button" className="link expr-link" onClick={() => props.onAdd(null)} title="Add an expression">
          + Add
        </button>
      </div>
      {expressions.length === 0 ? (
        <div className="expr-empty">
          <p className="hint">
            Define values and relationships, e.g. <code>zL = 0.5 + j1.2</code>. Impedances, admittances and reflection
            coefficients are plotted on the chart.
          </p>
          <button type="button" className="link expr-link" onClick={props.onInsertExample}>
            Insert an example
          </button>
        </div>
      ) : (
        <ol className="expr-list">
          {expressions.map((def, index) => (
            <ExpressionRow
              key={def.id}
              index={index}
              def={def}
              result={evaluation.results.get(def.id)}
              selected={props.selectedId === def.id}
              focus={props.focusId === def.id}
              actions={props}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

interface RowProps {
  readonly index: number;
  readonly def: ExpressionDef;
  readonly result: ExpressionResult | undefined;
  readonly selected: boolean;
  readonly focus: boolean;
  readonly actions: ExpressionPanelActions;
}

function ExpressionRow({ index, def, result, selected, focus, actions }: RowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus && inputRef.current) {
      inputRef.current.focus();
      actions.onFocusHandled();
    }
  }, [focus, actions]);

  const value = result?.status === 'ok' ? result.value : null;
  const type = value ? TYPE_INFO[value.type] : null;
  const plotted = result?.plot?.kind === 'point';
  const plottable = type?.plottable ?? false;
  const literal = sliderLiteral(def.text);
  const status = result?.status ?? 'empty';

  return (
    <li className={['expr-row', status, selected ? 'selected' : '', def.enabled ? '' : 'off'].join(' ').trim()}>
      <div className="expr-gutter">
        <span className="expr-index">{index + 1}</span>
        <button
          type="button"
          className={['expr-visibility', plottable ? 'plottable' : '', def.visible ? 'shown' : ''].join(' ').trim()}
          disabled={!plottable}
          aria-pressed={def.visible}
          aria-label={def.visible ? 'Hide on chart' : 'Show on chart'}
          title={plottable ? (def.visible ? 'Plotted — click to hide' : 'Hidden — click to plot') : 'Not a chart quantity'}
          onClick={() => actions.onSetVisible(def.id, !def.visible)}
        />
      </div>

      <div className="expr-main">
        <input
          ref={inputRef}
          className="expr-input"
          value={def.text}
          spellCheck={false}
          autoComplete="off"
          aria-label={`Expression ${index + 1}`}
          placeholder="name = expression"
          onChange={(e) => actions.onChangeText(def.id, e.target.value)}
          onFocus={() => {
            if (plotted) actions.onSelect(def.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              actions.onAdd(def.id);
            }
          }}
        />

        {status === 'ok' && value && type && (
          <div className="expr-result">
            <span className="expr-value">= {formatTypedValue(value)}</span>
            <span className={`type-chip type-${value.type}`} title={type.label}>
              {type.symbol}
            </span>
          </div>
        )}
        {status === 'error' && result?.error && (
          <div className="expr-error" role="alert">
            {result.error.message}
          </div>
        )}
        {status === 'disabled' && <div className="expr-note">Disabled — not evaluated</div>}
        {status === 'ok' && result?.plot?.kind === 'none' && result.plot.reason && (
          <div className="expr-note">{result.plot.reason}</div>
        )}

        {def.slider && literal && (
          <SliderControl
            spec={def.slider}
            value={literal.value}
            onValue={(v) => actions.onSliderValue(def.id, v)}
            onSpec={(spec) => actions.onSetSlider(def.id, spec)}
          />
        )}
        {def.slider && !literal && (
          <div className="expr-note">Slider paused: the expression is no longer a plain number.</div>
        )}
      </div>

      <div className="expr-actions">
        <label className="expr-toggle" title={def.enabled ? 'Disable' : 'Enable'}>
          <input
            type="checkbox"
            checked={def.enabled}
            onChange={(e) => actions.onSetEnabled(def.id, e.target.checked)}
            aria-label="Enabled"
          />
        </label>
        {literal && (
          <button
            type="button"
            className={def.slider ? 'expr-icon active' : 'expr-icon'}
            title={def.slider ? 'Remove slider' : 'Add slider'}
            aria-label={def.slider ? 'Remove slider' : 'Add slider'}
            onClick={() => actions.onSetSlider(def.id, def.slider ? null : defaultSlider(literal.name, literal.value))}
          >
            ⇿
          </button>
        )}
        <button
          type="button"
          className="expr-icon remove"
          title="Delete expression"
          aria-label="Delete expression"
          onClick={() => actions.onRemove(def.id)}
        >
          ×
        </button>
      </div>
    </li>
  );
}

interface SliderControlProps {
  readonly spec: SliderSpec;
  readonly value: number;
  readonly onValue: (value: number) => void;
  readonly onSpec: (spec: SliderSpec) => void;
}

function SliderControl({ spec, value, onValue, onSpec }: SliderControlProps) {
  const field = (key: keyof SliderSpec, label: string) => (
    <label className="slider-field">
      {label}
      <input
        type="number"
        defaultValue={spec[key]}
        step="any"
        onBlur={(e) => {
          const next = { ...spec, [key]: Number(e.target.value) };
          if ([next.min, next.max, next.step].every(Number.isFinite) && next.min < next.max && next.step > 0) onSpec(next);
          else e.target.value = String(spec[key]);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
  return (
    <div className="expr-slider">
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={Math.min(spec.max, Math.max(spec.min, value))}
        aria-label="Slider value"
        onChange={(e) => onValue(Number(e.target.value))}
      />
      <div className="slider-fields">
        {field('min', 'min')}
        {field('max', 'max')}
        {field('step', 'step')}
      </div>
    </div>
  );
}
