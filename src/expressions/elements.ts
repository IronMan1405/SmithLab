/**
 * Shared rules for series and shunt elements (Phase 1 semantics), used by
 * series()/shunt() and by the seriesPath()/shuntPath() sweeps.
 *
 * series(x, e): z_out = z(x) + e   (impedance domain)
 * shunt(x, e):  y_out = y(x) + e   (admittance domain)
 * The result keeps the type of x.
 */
import {
  type Complex,
  admittanceFromImpedance,
  admittanceFromReflection,
  denormalizeImpedance,
  impedanceFromAdmittance,
  impedanceFromReflection,
  normalizeImpedance,
  reflectionFromAdmittance,
  reflectionFromImpedance,
} from '../core';
import type { FunctionContext } from './functions';
import { type TypedValue, type ValueType, TYPE_INFO, TypeMismatch, isPlain, withArticle } from './types';

const label = (t: ValueType) => TYPE_INFO[t].label;

/** Reject points without a chart meaning (plain numbers, lengths). */
export function assertChartPoint(x: TypedValue, name: string): void {
  if (!TYPE_INFO[x.type].plottable) {
    throw new TypeMismatch(
      isPlain(x.type)
        ? `${name}() needs a point with an RF meaning; wrap the number in z(…), y(…), gamma(…) or Z(…)`
        : `${name}() needs an impedance, admittance or reflection coefficient, not ${withArticle(label(x.type))}`,
    );
  }
}

/**
 * How an element relates to an operation's domain:
 *   native  its value maps *linearly* into the domain (plain number, a typed
 *           value of the same domain, or Ω for series: Z/Z₀);
 *   cross   it is given in the other domain, so the operation adds its
 *           reciprocal (y for series, z or Ω for shunt).
 */
export function elementRelation(domain: ElementDomain, e: TypedValue): 'native' | 'cross' {
  if (isPlain(e.type)) return 'native';
  if (e.type === 'physicalImpedance') return domain === 'impedance' ? 'native' : 'cross';
  return e.type === domain ? 'native' : 'cross';
}

// ---------------------------------------------------------------------------
// Series and shunt elements
// ---------------------------------------------------------------------------

export type ElementDomain = 'impedance' | 'admittance';

/** Normalised z or y of a chart point, using the core conversions directly. */
export function pointIn(domain: ElementDomain, x: TypedValue, ctx: FunctionContext): Complex {
  let z: Complex;
  switch (x.type) {
    case 'impedance':
      z = x.value;
      break;
    case 'admittance':
      return domain === 'admittance' ? x.value : impedanceFromAdmittance(x.value);
    case 'reflection':
      return domain === 'impedance' ? impedanceFromReflection(x.value) : admittanceFromReflection(x.value);
    case 'physicalImpedance':
      ctx.noteZ0();
      z = normalizeImpedance(x.value, ctx.z0);
      break;
    default:
      throw new TypeMismatch(`unreachable: ${x.type}`);
  }
  return domain === 'impedance' ? z : admittanceFromImpedance(z);
}

/** Convert a normalised z or y back into the type of the original point. */
export function pointOut(domain: ElementDomain, v: Complex, type: ValueType, ctx: FunctionContext): Complex {
  const z = domain === 'impedance' ? v : impedanceFromAdmittance(v);
  switch (type) {
    case 'impedance':
      return z;
    case 'admittance':
      return domain === 'admittance' ? v : admittanceFromImpedance(v);
    case 'reflection':
      return domain === 'impedance' ? reflectionFromImpedance(v) : reflectionFromAdmittance(v);
    case 'physicalImpedance':
      ctx.noteZ0();
      return denormalizeImpedance(z, ctx.z0);
    default:
      throw new TypeMismatch(`unreachable: ${type}`);
  }
}

/**
 * Element value in the operation's domain (normalised).
 *   plain number      → already in the domain (normalised x for series, b for shunt)
 *   z / y             → converted to the domain (1/· across domains)
 *   Z (Ω)             → normalised by Z₀, then converted
 * A plain number next to a physical-impedance point is ambiguous (ohms or
 * normalised?) and rejected, consistent with `ZL + j10` being an error.
 */
export function elementIn(domain: ElementDomain, e: TypedValue, x: TypedValue, ctx: FunctionContext, name: string): Complex {
  if (isPlain(e.type)) {
    if (x.type === 'physicalImpedance') {
      throw new TypeMismatch(
        `${name}(): the point is in ohms but the element is a plain number, which is ambiguous. ` +
          `Write Z(…) for an element in ohms or z(…) for a normalized one`,
      );
    }
    return e.value;
  }
  switch (e.type) {
    case 'impedance':
      return domain === 'impedance' ? e.value : admittanceFromImpedance(e.value);
    case 'admittance':
      return domain === 'admittance' ? e.value : impedanceFromAdmittance(e.value);
    case 'physicalImpedance': {
      ctx.noteZ0();
      const z = normalizeImpedance(e.value, ctx.z0);
      return domain === 'impedance' ? z : admittanceFromImpedance(z);
    }
    default:
      throw new TypeMismatch(
        `${name}() element must be an impedance, admittance or plain number, not ${withArticle(label(e.type))}`,
      );
  }
}

