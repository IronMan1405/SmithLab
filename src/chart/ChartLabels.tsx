import { memo } from 'react';
import { type ChartLabel, gammaToSvg } from '../geometry';

interface ChartLabelsProps {
  readonly labels: readonly ChartLabel[];
}

/** Gap between a label's anchor and its text, in SVG user units. */
const AXIS_GAP = 14;
const BOUNDARY_GAP = 22;

type Anchor = 'start' | 'middle' | 'end';
type Baseline = 'alphabetic' | 'central' | 'hanging';

/** Pick text alignment so the text sits on the far side of `direction`. */
function alignment(direction: { re: number; im: number }): { anchor: Anchor; baseline: Baseline } {
  const anchor: Anchor = direction.re > 0.35 ? 'start' : direction.re < -0.35 ? 'end' : 'middle';
  const baseline: Baseline = direction.im > 0.35 ? 'alphabetic' : direction.im < -0.35 ? 'hanging' : 'central';
  return { anchor, baseline };
}

export const ChartLabels = memo(function ChartLabels({ labels }: ChartLabelsProps) {
  return (
    <g className="labels">
      {labels.map((label) => {
        const base = gammaToSvg(label.anchor);
        const gap = label.role === 'resistance' ? AXIS_GAP : BOUNDARY_GAP;
        // Direction is a Γ-plane vector: flip its imaginary part for SVG.
        const x = base.x + label.direction.re * gap;
        const y = base.y - label.direction.im * gap;
        const { anchor, baseline } = alignment(label.direction);
        return (
          <text
            key={label.id}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline={baseline}
            className={`chart-label label-${label.role}`}
          >
            {label.text}
          </text>
        );
      })}
    </g>
  );
});
