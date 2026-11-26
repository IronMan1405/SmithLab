import { memo } from 'react';
import type { GridCurve } from '../geometry';
import { shapeToPath } from './svg-path';

interface ChartGridProps {
  readonly curves: readonly GridCurve[];
}

/** Renders pre-computed grid curves; styling is entirely in chart.css. */
export const ChartGrid = memo(function ChartGrid({ curves }: ChartGridProps) {
  return (
    <g className="grid">
      {curves.map((curve) => (
        <path
          key={curve.id}
          d={shapeToPath(curve.shape)}
          className={`grid-curve grid-${curve.system} grid-${curve.tier}`}
          data-family={curve.family}
          data-value={curve.value}
        />
      ))}
    </g>
  );
});
