import {
  type Complex,
  DEFAULT_Z0,
  abs,
  admittanceFromReflection,
  arg,
  denormalizeImpedance,
  impedanceFromReflection,
  returnLossDb,
  vswrFromReflection,
} from '../core';
import { formatComplex, formatNumber } from './format';

interface ReadoutProps {
  readonly gamma: Complex | null;
}

/** Values at the point under the pointer, computed by the core engine. */
export function Readout({ gamma }: ReadoutProps) {
  if (!gamma) {
    return (
      <section className="readout" aria-live="polite">
        <h2>Point inspector</h2>
        <p className="hint">Hover over the chart to read Γ, z, y, VSWR and return loss at any point.</p>
      </section>
    );
  }

  const z = impedanceFromReflection(gamma);
  const rows: readonly [string, string][] = [
    ['Γ', formatComplex(gamma)],
    ['|Γ| ∠ θ', `${formatNumber(abs(gamma))} ∠ ${formatNumber((arg(gamma) * 180) / Math.PI)}°`],
    ['z', formatComplex(z)],
    ['y', formatComplex(admittanceFromReflection(gamma))],
    [`Z (Z₀ = ${DEFAULT_Z0} Ω)`, `${formatComplex(denormalizeImpedance(z, DEFAULT_Z0))} Ω`],
    ['VSWR', formatNumber(vswrFromReflection(gamma))],
    ['Return loss', `${formatNumber(returnLossDb(gamma))} dB`],
  ];

  return (
    <section className="readout" aria-live="polite">
      <h2>Point inspector</h2>
      <dl>
        {rows.map(([term, value]) => (
          <div key={term} className="row">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
