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
const SQUARE = 5;
const SELECTED_RING = 11;
const LABEL_SIZE = 12;
const LABEL_OFFSET = 10;

/**
 * Marker shapes distinguish the kinds of point by shape as well as colour:
 * plotted points are circles, line inputs are diamonds, and expression
 * results are squares.
 */
export const PointsLayer = memo(function PointsLayer({ points, selectedId, unitsPerPixel: u, onFocusPoint }: PointsLayerProps) {
  // Points at the same position (e.g. zL and yL = 1/zL describe the same load)
  // get their labels stacked instead of overprinted.
  const stackIndex = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const p of points) {
    const key = `${p.gamma.re.toFixed(6)},${p.gamma.im.toFixed(6)}`;
    const n = seen.get(key) ?? 0;
    stackIndex.set(p.id, n);
    seen.set(key, n + 1);
  }
  // Selected point last: on top for both painting and hit-testing.
  const ordered = [...points.filter((p) => p.id !== selectedId), ...points.filter((p) => p.id === selectedId)];
  return (
    <g className="points">
      {ordered.map((point) => {
        const { x, y } = gammaToSvg(point.gamma);
        const selected = point.id === selectedId;
        const derived = point.role === 'derived';
        const expression = point.role === 'expression';
        const d = DIAMOND * u;
        const sq = SQUARE * u;
        return (
          <g
            key={point.id}
            {...{ [POINT_ID_ATTRIBUTE]: point.id }}
            className={['point', point.role, selected ? 'selected' : ''].join(' ').trim()}
            transform={`translate(${x} ${y})`}
            tabIndex={0}
            role="button"
            aria-pressed={selected}
            aria-label={`${derived ? 'Line input' : expression ? 'Expression' : 'Point'} ${point.name}`}
            onFocus={() => onFocusPoint(point.id)}
          >
            <circle className="point-hit" r={HIT_RADIUS * u} />
            {selected && <circle className="point-ring" r={SELECTED_RING * u} />}
            {derived ? (
              <path className="point-dot" d={`M 0 ${-d} L ${d} 0 L 0 ${d} L ${-d} 0 Z`} />
            ) : expression ? (
              <rect className="point-dot" x={-sq} y={-sq} width={2 * sq} height={2 * sq} />
            ) : (
              <circle className="point-dot" r={DOT_RADIUS * u} />
            )}
            <text
              className="point-label"
              x={LABEL_OFFSET * u}
              y={-(LABEL_OFFSET + (stackIndex.get(point.id) ?? 0) * LABEL_SIZE * 1.2) * u}
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
