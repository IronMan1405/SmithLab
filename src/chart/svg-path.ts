/**
 * Conversion of Γ-plane shapes to SVG path data. This is pure coordinate
 * mapping — no Smith Chart mathematics lives here.
 */
import { type Point, type Shape, CHART_RADIUS, gammaLengthToSvg, gammaToSvg } from '../geometry';

function n(value: number): string {
  // 3 decimals in a 2240-unit viewBox is far below a device pixel.
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function pt(p: Point): string {
  return `${n(p.x)} ${n(p.y)}`;
}

/**
 * SVG arc flags. Because SVG's y axis points down, a counter-clockwise sweep
 * in the Γ-plane is drawn with sweep-flag = 0.
 */
function arcCommand(radius: number, largeArc: boolean, ccw: boolean, end: Point): string {
  const r = n(radius);
  return `A ${r} ${r} 0 ${largeArc ? 1 : 0} ${ccw ? 0 : 1} ${pt(end)}`;
}

export function shapeToPath(shape: Shape, radius: number = CHART_RADIUS): string {
  switch (shape.kind) {
    case 'segment':
      return `M ${pt(gammaToSvg(shape.start, radius))} L ${pt(gammaToSvg(shape.end, radius))}`;
    case 'circle': {
      const c = gammaToSvg(shape.center, radius);
      const r = gammaLengthToSvg(shape.radius, radius);
      const right = { x: c.x + r, y: c.y };
      const left = { x: c.x - r, y: c.y };
      // A full circle cannot be one arc command; draw two half circles.
      return `M ${pt(right)} ${arcCommand(r, false, true, left)} ${arcCommand(r, false, true, right)} Z`;
    }
    case 'arc': {
      const start = gammaToSvg(shape.start, radius);
      const end = gammaToSvg(shape.end, radius);
      const r = gammaLengthToSvg(shape.radius, radius);
      return `M ${pt(start)} ${arcCommand(r, Math.abs(shape.sweep) > Math.PI, shape.sweep > 0, end)}`;
    }
  }
}
