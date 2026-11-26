import { memo } from 'react';
import type { Complex } from '../core';
import type { Curve } from '../geometry';
import { gammaToSvg } from '../geometry';
import { CURVE_ID_ATTRIBUTE } from '../interaction/useChartInteraction';
import { curvePath } from './curve-paths';

export interface CurveVisual {
  readonly id: string;
  readonly curve: Curve;
  /** Palette key, styled by `--curve-<color>`. */
  readonly color: string;
  readonly selected: boolean;
  /** Constructions such as radial guides are drawn dashed. */
  readonly dashed?: boolean;
}

interface CurvesLayerProps {
  readonly curves: readonly CurveVisual[];
  readonly unitsPerPixel: number;
}

/**
 * Expression-defined curves. Each has a visible stroke and a wide
 * transparent hit path so it can be selected; the selected one is drawn last.
 */
export const CurvesLayer = memo(function CurvesLayer({ curves, unitsPerPixel }: CurvesLayerProps) {
  const ordered = [...curves.filter((c) => !c.selected), ...curves.filter((c) => c.selected)];
  return (
    <g className="curves">
      {ordered.map((c) => {
        const d = curvePath(c.curve, unitsPerPixel);
        if (!d) return null;
        return (
          <g
            key={c.id}
            className={['curve', c.selected ? 'selected' : '', c.dashed ? 'dashed' : ''].join(' ').trim()}
            style={{ color: `var(--curve-${c.color})` }}
          >
            {c.selected && <path className="curve-halo" d={d} />}
            <path className="curve-stroke" d={d} />
            <path className="curve-hit" d={d} {...{ [CURVE_ID_ATTRIBUTE]: c.id }} />
          </g>
        );
      })}
    </g>
  );
});

interface InspectionMarksProps {
  /** Probe point along the selected curve. */
  readonly probe: Complex | null;
  /** Intersections of the selected curve with other visible curves. */
  readonly intersections: readonly { readonly gamma: Complex; readonly active: boolean }[];
  readonly unitsPerPixel: number;
}

/** Markers for curve inspection; drawn above curves, not hit-testable. */
export function InspectionMarks({ probe, intersections, unitsPerPixel: u }: InspectionMarksProps) {
  return (
    <g className="inspection-marks" aria-hidden="true">
      {intersections.map(({ gamma, active }, i) => {
        const p = gammaToSvg(gamma);
        const s = (active ? 7 : 5) * u;
        return (
          <path
            key={i}
            className={active ? 'intersection-mark active' : 'intersection-mark'}
            d={`M ${p.x - s} ${p.y - s} L ${p.x + s} ${p.y + s} M ${p.x - s} ${p.y + s} L ${p.x + s} ${p.y - s}`}
          />
        );
      })}
      {probe && (
        <circle className="probe-mark" cx={gammaToSvg(probe).x} cy={gammaToSvg(probe).y} r={6 * u} />
      )}
    </g>
  );
}
