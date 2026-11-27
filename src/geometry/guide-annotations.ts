/**
 * On-chart wavelength readings for radial guides.
 *
 * A guide is a ray of constant ∠Γ. On the chart it continues past the unit
 * circle to the outer ring of the wavelength scales (that extension is a
 * visual aid only; the guide *curve* still ends at |Γ| = 1), and its
 * readings are written just outside the outer ring, along the circle like
 * the scale numbers:
 *
 *   WTG = ((π − ∠Γ)/4π) mod ½   increases clockwise     (↻, toward generator)
 *   WTL = (½ − WTG) mod ½        increases anticlockwise (↺, toward load)
 *
 * Readings use the *displayed* angle, so they match the scales in every
 * chart mode. The selected guide shows both readings, others a compact WTG.
 * Guides closer than MIN_SEPARATION in angle are stacked outward.
 */
import { type Complex, abs, arg, complex } from '../core';
import { uprightTangentAngle, wavelengthsTowardGenerator, wavelengthsTowardLoad } from './wavelength-scale';

export interface GuideAnnotationInput {
  readonly id: string;
  /** Any point on the displayed guide ray (typically its end on the unit circle). */
  readonly end: Complex;
  readonly selected: boolean;
}

export interface GuideLayout {
  /** Radius the guide is extended to, and outside which the readings go. */
  readonly outerRadius: number;
  /** Height of one line of text, in Γ units. */
  readonly lineHeight: number;
  /** Space between the outer radius and the first line, in Γ units. */
  readonly gap: number;
}

export interface GuideAnnotation {
  readonly id: string;
  /** Point where the guide meets the unit circle. */
  readonly boundary: Complex;
  /** End of the visual extension (on the outer radius). */
  readonly extensionEnd: Complex;
  /** Text lines in reading order, each centred at its position. */
  readonly lines: readonly { readonly text: string; readonly position: Complex }[];
  /** Upright text direction along the circle (radians, Γ-plane). */
  readonly textAngle: number;
  readonly full: boolean;
  readonly wtg: number;
  readonly wtl: number;
}

export const MIN_SEPARATION = (8 * Math.PI) / 180;

export const DEFAULT_GUIDE_LAYOUT: GuideLayout = { outerRadius: 1.25, lineHeight: 0.04, gap: 0.012 };

/** Three-decimal wavelength reading in the scales' style: 0.173 → ".173". */
export function formatWavelengthReading(value: number): string {
  return value.toFixed(3).replace(/^0/, '');
}

function angularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
}

export function guideAnnotations(
  guides: readonly GuideAnnotationInput[],
  layout: GuideLayout = DEFAULT_GUIDE_LAYOUT,
): GuideAnnotation[] {
  // Selected guide first, so it keeps the innermost slot; otherwise input order.
  const ordered = [...guides.filter((g) => g.selected), ...guides.filter((g) => !g.selected)];
  const placed: { angle: number; level: number }[] = [];
  const result: GuideAnnotation[] = [];

  for (const g of ordered) {
    const magnitude = abs(g.end);
    const wtg = wavelengthsTowardGenerator(g.end);
    const wtl = wavelengthsTowardLoad(g.end);
    if (!(magnitude > 0) || wtg === null || wtl === null) continue; // no direction at Γ = 0
    const angle = arg(g.end);
    let level = 0;
    while (placed.some((p) => p.level === level && angularDistance(p.angle, angle) < MIN_SEPARATION)) level++;
    placed.push({ angle, level });

    const unit = complex(g.end.re / magnitude, g.end.im / magnitude);
    const at = (r: number) => complex(unit.re * r, unit.im * r);
    const texts = g.selected
      ? [`WTG ↻ ${formatWavelengthReading(wtg)}λ`, `WTL ↺ ${formatWavelengthReading(wtl)}λ`]
      : [`↻ ${formatWavelengthReading(wtg)}λ`];
    // Upright text along the circle: on the upper half "up" points outward,
    // on the lower half inward. Put the first line on top either way.
    const upOutward = Math.sin(angle) >= 0;
    const base = layout.outerRadius + layout.gap + level * 2 * layout.lineHeight;
    const n = texts.length;
    const lines = texts.map((text, i) => ({
      text,
      position: at(base + ((upOutward ? n - 1 - i : i) + 0.5) * layout.lineHeight),
    }));

    result.push({
      id: g.id,
      boundary: unit,
      extensionEnd: at(layout.outerRadius),
      lines,
      textAngle: uprightTangentAngle(angle),
      full: g.selected,
      wtg,
      wtl,
    });
  }
  return result;
}
