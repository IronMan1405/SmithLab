import { type Complex } from '../core';
import { gammaToSvg, linePathCircle, lineTransformationArc } from '../geometry';
import { shapeToPath } from './svg-path';

export interface LineVisual {
  readonly id: string;
  readonly loadGamma: Complex;
  readonly length: number;
  /** The line, its input point or its load is selected. */
  readonly emphasized: boolean;
}

interface TransmissionLineLayerProps {
  readonly lines: readonly LineVisual[];
  readonly unitsPerPixel: number;
}

const ARROW_LENGTH = 11; // px
const ARROW_HALF_WIDTH = 5; // px

/**
 * For each line: the full constant-|Γ| path, the directed arc actually
 * travelled from load to input, and an arrowhead showing the direction.
 */
export function TransmissionLineLayer({ lines, unitsPerPixel: u }: TransmissionLineLayerProps) {
  return (
    <g className="line-layer" aria-hidden="true">
      {lines.map((line) => {
        const circle = linePathCircle(line.loadGamma);
        const arc = lineTransformationArc(line.loadGamma, line.length);
        const className = line.emphasized ? 'line-visual emphasized' : 'line-visual';
        let arrow: string | null = null;
        if (arc) {
          // Arrowhead in SVG space: tangent is a Γ-plane vector, so flip its y.
          const tip = gammaToSvg(arc.end);
          const tx = arc.tangent.re;
          const ty = -arc.tangent.im;
          const L = ARROW_LENGTH * u;
          const W = ARROW_HALF_WIDTH * u;
          const bx = tip.x - tx * L;
          const by = tip.y - ty * L;
          arrow = `M ${tip.x} ${tip.y} L ${bx - ty * W} ${by + tx * W} L ${bx + ty * W} ${by - tx * W} Z`;
        }
        return (
          <g key={line.id} className={className}>
            {circle && <path className="line-path" d={shapeToPath(circle)} />}
            {arc && <path className="line-arc" d={shapeToPath(arc.shape)} />}
            {arrow && <path className="line-arrow" d={arrow} />}
          </g>
        );
      })}
    </g>
  );
}
