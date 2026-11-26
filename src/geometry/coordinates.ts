/**
 * Coordinate systems
 * ==================
 *
 * SmithLab uses three coordinate systems. Only the first is mathematical;
 * the other two belong to the renderer.
 *
 * 1. Reflection-coefficient plane (Γ-plane)
 *    Γ = u + jv. The passive Smith Chart is the closed unit disc |Γ| ≤ 1.
 *    +v (positive imaginary, inductive) is "up". All geometry in
 *    `src/geometry` is expressed in this plane as `Complex` values.
 *
 * 2. SVG user space (viewBox units)
 *    A fixed square coordinate space, independent of screen size:
 *      x = u · R
 *      y = −v · R          (SVG's y axis points down, so v is negated)
 *    with R = CHART_RADIUS. The origin Γ = 0 is at (0, 0) and the viewBox
 *    extends CHART_MARGIN beyond the unit circle on every side to leave room
 *    for boundary labels.
 *
 * 3. Screen (CSS pixel / client) coordinates
 *    The browser maps SVG user space to the screen via the <svg> element's
 *    viewBox with preserveAspectRatio="xMidYMid meet": a uniform scale plus
 *    a translation, so the chart is never distorted. The renderer converts
 *    client coordinates back to SVG user space with the element's inverse
 *    screen CTM (see `src/chart/screen.ts`), then to Γ with `svgToGamma`.
 */
import { type Complex, complex } from '../core';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Radius of the unit circle in SVG user units. */
export const CHART_RADIUS = 1000;

/** Space around the unit circle reserved for labels, in SVG user units. */
export const CHART_MARGIN = 120;

export interface ViewBox {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

export const CHART_VIEWBOX: ViewBox = Object.freeze({
  minX: -(CHART_RADIUS + CHART_MARGIN),
  minY: -(CHART_RADIUS + CHART_MARGIN),
  width: 2 * (CHART_RADIUS + CHART_MARGIN),
  height: 2 * (CHART_RADIUS + CHART_MARGIN),
});

export function viewBoxAttribute(box: ViewBox = CHART_VIEWBOX): string {
  return `${box.minX} ${box.minY} ${box.width} ${box.height}`;
}

/** Γ-plane → SVG user space. Requires a finite Γ. */
export function gammaToSvg(gamma: Complex, radius: number = CHART_RADIUS): Point {
  if (!Number.isFinite(gamma.re) || !Number.isFinite(gamma.im)) {
    throw new RangeError('Cannot map a non-finite reflection coefficient to SVG coordinates');
  }
  return { x: gamma.re * radius + 0, y: -gamma.im * radius + 0 };
}

/** SVG user space → Γ-plane. */
export function svgToGamma(point: Point, radius: number = CHART_RADIUS): Complex {
  // `+ 0` normalises −0 to +0 so callers never see a signed zero.
  return complex(point.x / radius + 0, -point.y / radius + 0);
}

/** A length in the Γ-plane expressed in SVG user units. */
export function gammaLengthToSvg(length: number, radius: number = CHART_RADIUS): number {
  return length * radius;
}
