import { memo } from 'react';
import { gammaToSvg } from '../geometry';
import { POINT_ID_ATTRIBUTE } from '../interaction/useChartInteraction';
import type { ResolvedPoint } from '../workspace';

interface PointsLayerProps {
  readonly points: readonly ResolvedPoint[];
  readonly selectedId: string | null;
  /** SVG user units per screen pixel, so markers keep a constant on-screen size. */
  readonly unitsPerPixel: number;
  readonly onFocusPoint: (id: string) => void;
}

/** On-screen sizes in CSS pixels. */
const HIT_RADIUS = 14;
const DOT_RADIUS = 5.5;
const DIAMOND = 7;
const SELECTED_RING = 11;
const LABEL_SIZE = 12;
const LABEL_OFFSET = 10;

/**
 * Plotted points are filled circles; derived points (line inputs) are
 * diamonds, so the two are distinguishable by shape as well as colour.
 */
export const PointsLayer = memo(function PointsLayer({ points, selectedId, unitsPerPixel: u, onFocusPoint }: PointsLayerProps) {
  // Selected point last: on top for both painting and hit-testing.
  const ordered = [...points.filter((p) => p.id !== selectedId), ...points.filter((p) => p.id === selectedId)];
  return (
    <g className="points">
      {ordered.map((point) => {
        const { x, y } = gammaToSvg(point.gamma);
        const selected = point.id === selectedId;
        const derived = point.role === 'derived';
        const d = DIAMOND * u;
        return (
          <g
            key={point.id}
            {...{ [POINT_ID_ATTRIBUTE]: point.id }}
            className={['point', derived ? 'derived' : 'source', selected ? 'selected' : ''].join(' ').trim()}
            transform={`translate(${x} ${y})`}
            tabIndex={0}
            role="button"
            aria-pressed={selected}
            aria-label={`${derived ? 'Line input' : 'Point'} ${point.name}`}
            onFocus={() => onFocusPoint(point.id)}
          >
            <circle className="point-hit" r={HIT_RADIUS * u} />
            {selected && <circle className="point-ring" r={SELECTED_RING * u} />}
            {derived ? (
              <path className="point-dot" d={`M 0 ${-d} L ${d} 0 L 0 ${d} L ${-d} 0 Z`} />
            ) : (
              <circle className="point-dot" r={DOT_RADIUS * u} />
            )}
            <text
              className="point-label"
              x={LABEL_OFFSET * u}
              y={-LABEL_OFFSET * u}
              style={{ fontSize: LABEL_SIZE * u, strokeWidth: 3 * u }}
            >
              {point.name}
            </text>
          </g>
        );
      })}
    </g>
  );
});
