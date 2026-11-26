/**
 * Screen (client pixel) → SVG user space, via the element's current screen
 * transformation matrix. This is the only place screen coordinates appear;
 * combine with `svgToGamma` to reach the Γ-plane.
 */
import type { Point } from '../geometry';

export function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Point | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}
