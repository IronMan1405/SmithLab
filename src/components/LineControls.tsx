import { useEffect, useId, useState } from 'react';
import { LINE_PERIOD, electricalLengthDegrees } from '../core';
import { formatNumber } from './format';

interface LineControlsProps {
  /** Electrical length in wavelengths, toward the generator. */
  readonly length: number;
  readonly onChange: (length: number) => void;
  readonly onRemove: () => void;
}

const SLIDER_STEP = 0.001;

function parseLength(text: string): number | null {
  const value = Number(text.trim().replace(/λ$/, ''));
  return text.trim() !== '' && Number.isFinite(value) ? value : null;
}

function formatLength(length: number): string {
  return String(Number(length.toFixed(6)));
}

/**
 * Electrical-length control for a transmission line.
 *
 * The slider covers one period (0 to ½λ). Numeric entry accepts any finite
 * length, including more than ½λ and negative values (toward the load). For
 * lengths outside [0, ½λ) the slider shows the equivalent position within
 * the period, and dragging it keeps the whole number of half-wavelengths
 * already entered.
 */
export function LineControls({ length, onChange, onRemove }: LineControlsProps) {
  const id = useId();
  const [draft, setDraft] = useState(formatLength(length));
  const valid = parseLength(draft) !== null;

  useEffect(() => {
    setDraft((d) => (parseLength(d) === length ? d : formatLength(length)));
  }, [length]);

  const periodOffset = Math.floor(length / LINE_PERIOD) * LINE_PERIOD;
  const sliderValue = length - periodOffset;
  const towardGenerator = length >= 0;

  return (
    <section className="line-controls" aria-label="Transmission line">
      <div className="line-controls-head">
        <h3>Transmission line</h3>
        <span className={towardGenerator ? 'direction generator' : 'direction load'} title="Direction of the transformation">
          {towardGenerator ? 'toward generator ↻' : 'toward load ↺'}
        </span>
      </div>

      <div className="length-row">
        <label htmlFor={id}>Length</label>
        <div className={valid ? 'length-input' : 'length-input invalid'}>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={draft}
            aria-invalid={!valid}
            onChange={(e) => {
              setDraft(e.target.value);
              const parsed = parseLength(e.target.value);
              if (parsed !== null) onChange(parsed);
            }}
            onBlur={() => setDraft(formatLength(length))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
            }}
          />
          <span className="unit">λ</span>
        </div>
        <button type="button" className="small" onClick={() => onChange(0)} disabled={length === 0} title="Reset length to 0λ">
          0λ
        </button>
      </div>

      <input
        className="length-slider"
        type="range"
        min={0}
        max={LINE_PERIOD}
        step={SLIDER_STEP}
        value={sliderValue}
        aria-label="Electrical length (one half-wavelength period)"
        onChange={(e) => onChange(periodOffset + Number(e.target.value))}
      />
      <div className="slider-scale" aria-hidden="true">
        <span>0</span>
        <span>λ/8</span>
        <span>λ/4</span>
        <span>3λ/8</span>
        <span>λ/2</span>
      </div>

      <p className="line-meta">
        βl = {formatNumber(electricalLengthDegrees(length))}° · Z₀ of line = workspace Z₀
      </p>

      <button type="button" className="danger" onClick={onRemove} title="Remove this transmission line (Delete)">
        Remove line
      </button>
    </section>
  );
}
