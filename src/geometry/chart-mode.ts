/**
 * Chart coordinate modes.
 *
 * The active mode chooses which coordinate grid *numbers* are placed on:
 *
 *   impedance mode   number w is drawn at C_Z(w) = (w − 1)/(w + 1)
 *   admittance mode  number w is drawn at C_Y(w) = (1 − w)/(1 + w) = −C_Z(w)
 *
 * (C_Y is where the admittance grid, as drawn, carries the label w.)
 *
 * Every chart object is in one of two frames (see `Curve.frame`):
 *   number  z/y/Z expression values and curves made of such numbers. They
 *           are stored canonically as κ = C_Z(w) and drawn at s·κ, with
 *           s = +1 in impedance mode and −1 in admittance mode.
 *   plane   physical Γ: Γ expressions, manual and line-input points, Γ
 *           curves, wavelength scales. Drawn at Γ in both modes.
 *
 * So in impedance mode zL and yL = 1/zL are diametrically opposite, and in
 * admittance mode yL sits on its admittance-grid coordinates. The mode is a
 * view setting: it never enters expression evaluation.
 */
import { type Complex, admittanceFromReflection, impedanceFromReflection } from '../core';
import { type Curve, type CurveFrame, rotateCurve } from './curves';
import { rotatePoint, unitPhasor } from './shapes';

export type ChartMode = 'impedance' | 'admittance';

const HALF_TURN = unitPhasor(Math.PI);

/** True when objects of this frame are drawn flipped (rotated by π) in this mode. */
export function isFlipped(frame: CurveFrame, mode: ChartMode): boolean {
  return frame === 'number' && mode === 'admittance';
}

/** Canonical → displayed position. It is its own inverse (displayed → canonical). */
export function displayPosition(position: Complex, frame: CurveFrame, mode: ChartMode): Complex {
  return isFlipped(frame, mode) ? rotatePoint(position, HALF_TURN) : position;
}

export const canonicalFromDisplay = displayPosition;

const flipped = new WeakMap<Curve, Curve>();

/**
 * The curve as drawn in `mode`. Number curves are rotated by π (exactly)
 * in admittance mode; results are cached per curve so renderers can cache
 * their paths by curve identity.
 */
export function displayCurve(curve: Curve, mode: ChartMode): Curve {
  if (!isFlipped(curve.frame, mode)) return curve;
  let hit = flipped.get(curve);
  if (!hit) {
    hit = rotateCurve(curve, Math.PI, { annotate: false });
    flipped.set(curve, hit);
  }
  return hit;
}

/** The active grid's coordinate at a displayed position: z in impedance mode, y in admittance mode. */
export function activeGridReading(display: Complex, mode: ChartMode): Complex {
  return mode === 'impedance' ? impedanceFromReflection(display) : admittanceFromReflection(display);
}

/** A plane curve unchanged by a half-turn (a circle centred on Γ = 0): it looks the same in both modes. */
export function isCentrallySymmetric(curve: Curve): boolean {
  return curve.shape?.kind === 'circle' && curve.shape.center.re === 0 && curve.shape.center.im === 0;
}

export type IntersectionFrame =
  | { readonly ok: true; readonly frame: CurveFrame; readonly domain: Curve['domain'] }
  | { readonly ok: false; readonly reason: string };

/**
 * The frame in which the intersection of two curves is well defined
 * independently of the chart mode:
 *
 *   plane ∩ plane                       → plane (a Γ point)
 *   number ∩ number                     → number (domain of the first curve)
 *   number ∩ symmetric plane curve      → number (the half-turn leaves the plane curve unchanged)
 *   number ∩ other plane curve          → not defined for this milestone: the
 *                                          two curves move relative to each
 *                                          other when the mode changes.
 *
 * The last case is a current limitation, not a permanent rule: a future
 * mode-dependent intersection can take the mode as an extra input here.
 */
export function intersectionFrame(a: Curve, b: Curve): IntersectionFrame {
  if (a.frame === 'plane' && b.frame === 'plane') return { ok: true, frame: 'plane', domain: null };
  if (a.frame === 'number' && b.frame === 'number') return { ok: true, frame: 'number', domain: a.domain };
  const [numberCurve, planeCurve] = a.frame === 'number' ? [a, b] : [b, a];
  if (isCentrallySymmetric(planeCurve)) return { ok: true, frame: 'number', domain: numberCurve.domain };
  return {
    ok: false,
    reason:
      'This intersection would depend on the chart coordinate mode: one curve is made of impedance/admittance numbers ' +
      'and the other of fixed Γ positions. Build both from the same kind of value (e.g. radial(zL) instead of radial(gamma(zL))).',
  };
}
