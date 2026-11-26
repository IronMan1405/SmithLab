import { useEffect, useId, useState } from 'react';

interface Z0ControlProps {
  readonly value: number;
  readonly onChange: (z0: number) => void;
}

function parseZ0(text: string): number | null {
  const value = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Reference impedance input. Valid values apply immediately; an invalid
 * entry is flagged and reverts to the current value on blur.
 */
export function Z0Control({ value, onChange }: Z0ControlProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const valid = parseZ0(draft) !== null;

  useEffect(() => {
    setDraft((d) => (parseZ0(d) === value ? d : String(value)));
  }, [value]);

  return (
    <div className={valid ? 'z0-control' : 'z0-control invalid'}>
      <label htmlFor={id}>Z₀</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={draft}
        aria-invalid={!valid}
        title={valid ? 'Characteristic (reference) impedance' : 'Enter a positive number of ohms'}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = parseZ0(e.target.value);
          if (parsed !== null) onChange(parsed);
        }}
        onBlur={() => setDraft(String(value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="unit">Ω</span>
    </div>
  );
}
