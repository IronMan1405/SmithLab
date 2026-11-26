import { memo } from 'react';
import { type ChartLabel, gammaToSvg } from '../geometry';

interface ChartLabelsProps {
  readonly labels: readonly ChartLabel[];
  /** Current view zoom; label size and offsets are divided by it so text keeps its size on screen. */
  readonly zoom: number;
}

/** Sizes in SVG user units at zoom 1. */
const AXIS_GAP = 14;
const BOUNDARY_GAP = 22;
const FONT_SIZE = 30;
const AXIS_END_FONT_SIZE = 36;
const HALO = 6;

type Anchor = 'start' | 'middle' | 'end';
type Baseline = 'alphabetic' | 'central' | 'hanging';

/** Pick text alignment so the text sits on the far side of `direction`. */
export function labelAlignment(direction: { re: number; im: number }): { anchor: Anchor; baseline: Baseline } {
  const anchor: Anchor = direction.re > 0.35 ? 'start' : direction.re < -0.35 ? 'end' : 'middle';
  const baseline: Baseline = direction.im > 0.35 ? 'alphabetic' : direction.im < -0.35 ? 'hanging' : 'central';
  return { anchor, baseline };
}

export const ChartLabels = memo(function ChartLabels({ labels, zoom }: ChartLabelsProps) {
  return (
    <g className="labels">
      {labels.map((label) => {
        const base = gammaToSvg(label.anchor);
        const onAxis = label.role === 'resistance' || label.role === 'conductance';
        const gap = (onAxis ? AXIS_GAP : BOUNDARY_GAP) / zoom;
        // Direction is a Γ-plane vector: flip its imaginary part for SVG.
        const x = base.x + label.direction.re * gap;
        const y = base.y - label.direction.im * gap;
        const { anchor, baseline } = labelAlignment(label.direction);
        const fontSize = (label.role === 'axis-end' ? AXIS_END_FONT_SIZE : FONT_SIZE) / zoom;
        return (
          <text
            key={label.id}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline={baseline}
            className={`chart-label label-${label.role}`}
            style={{ fontSize, strokeWidth: HALO / zoom }}
          >
            {label.text}
          </text>
        );
      })}
    </g>
  );
});
