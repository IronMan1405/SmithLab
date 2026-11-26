/** Display formatting for typed expression values (presentation only). */
import { abs, arg } from '../core';
import type { TypedValue } from '../expressions';
import { formatComplex, formatNumber } from './format';

export function formatTypedValue(v: TypedValue): string {
  switch (v.type) {
    case 'real':
      return formatNumber(v.value.re);
    case 'length':
      return `${formatNumber(v.value.re)}λ`;
    case 'physicalImpedance':
      return `${formatComplex(v.value)} Ω`;
    case 'reflection': {
      const magnitude = abs(v.value);
      const polar = magnitude === 0 ? '' : `  (|Γ| ${formatNumber(magnitude)} ∠ ${formatNumber((arg(v.value) * 180) / Math.PI)}°)`;
      return `${formatComplex(v.value)}${polar}`;
    }
    default:
      return formatComplex(v.value);
  }
}
