/**
 * Generators for expressions created by UI actions. They emit ordinary
 * expression text built from existing functions, so every construction stays
 * inspectable and editable, and its mathematics lives in one place.
 */
import { FUNCTIONS } from './functions';
import { type ValueType, TYPE_INFO, declaredTypeForName } from './types';
import type { SliderSpec } from './definitions';

export interface LineConstruction {
  readonly lengthName: string;
  readonly lengthText: string;
  readonly lengthSlider: SliderSpec;
  readonly resultName: string;
  readonly resultText: string;
}

export const DEFAULT_LINE_LENGTH = 0.125;

function unique(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

/**
 * Text for "add a transmission line" on an expression point:
 *
 *   l_<src> = 0.125                 (electrical length, with a slider)
 *   <src>_in = line(<src>, l_<src>)
 *
 * `line()` keeps the type of its first argument, so the result name keeps
 * the source's prefix (zL → zL_in is an impedance, gammaL → gammaL_in a
 * reflection coefficient) and the naming convention stays consistent.
 * Returns null — rather than invalid text — when the source has no name or
 * its type has no chart position.
 */
export function lineConstruction(
  source: { readonly name: string | null; readonly type: ValueType },
  takenNames: ReadonlySet<string>,
  length = DEFAULT_LINE_LENGTH,
): LineConstruction | null {
  if (!source.name || !TYPE_INFO[source.type].plottable || !('line' in FUNCTIONS)) return null;
  const lengthName = unique(`l_${source.name}`, takenNames);
  const resultName = unique(`${source.name}_in`, new Set([...takenNames, lengthName]));
  // Defensive: the generated names must agree with the naming convention.
  if (declaredTypeForName(lengthName) !== 'length') return null;
  const declared = declaredTypeForName(resultName);
  if (declared !== null && declared !== source.type) return null;
  return {
    lengthName,
    lengthText: `${lengthName} = ${length}`,
    lengthSlider: { min: 0, max: 0.5, step: 0.001 },
    resultName,
    resultText: `${resultName} = line(${source.name}, ${lengthName})`,
  };
}
