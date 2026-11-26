import { type Complex, impedanceFromReflection } from '../core';
import { formatComplex } from './format';

/** Small live read-out of the position under the pointer. */
export function HoverStatus({ gamma }: { readonly gamma: Complex | null }) {
  if (!gamma) return null;
  return (
    <div className="hover-status" aria-hidden="true">
      <span>Γ {formatComplex(gamma, 3)}</span>
      <span>z {formatComplex(impedanceFromReflection(gamma), 3)}</span>
    </div>
  );
}
