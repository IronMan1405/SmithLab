import { type PointerEvent, useCallback, useMemo, useRef } from 'react';
import { type Complex, abs } from '../core';
import {
  CHART_RADIUS,
  buildAdmittanceGrid,
  buildChartFrame,
  buildImpedanceGrid,
  reactanceBoundaryLabels,
  resistanceAxisLabels,
  svgToGamma,
  viewBoxAttribute,
} from '../geometry';
import { ChartGrid } from './ChartGrid';
import { ChartLabels } from './ChartLabels';
import { CursorOverlay } from './CursorOverlay';
import { clientToSvg } from './screen';
import { shapeToPath } from './svg-path';
import './chart.css';

export interface SmithChartProps {
  readonly showImpedanceGrid: boolean;
  readonly showAdmittanceGrid: boolean;
  /** Γ currently under the pointer (|Γ| < 1), or null. */
  readonly cursor: Complex | null;
  readonly onCursorChange: (gamma: Complex | null) => void;
}

const CLIP_ID = 'smithlab-unit-disc';

// Geometry is static for Milestone 1: compute it once at module load.
const FRAME = buildChartFrame();
const IMPEDANCE_GRID = buildImpedanceGrid();
const ADMITTANCE_GRID = buildAdmittanceGrid();
const LABELS = [...resistanceAxisLabels(), ...reactanceBoundaryLabels()];

export function SmithChart({ showImpedanceGrid, showAdmittanceGrid, cursor, onCursorChange }: SmithChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const point = clientToSvg(svg, event.clientX, event.clientY);
      if (!point) return;
      const gamma = svgToGamma(point);
      onCursorChange(abs(gamma) < 1 ? gamma : null);
    },
    [onCursorChange],
  );

  const handlePointerLeave = useCallback(() => onCursorChange(null), [onCursorChange]);

  const frame = useMemo(
    () => ({ boundary: shapeToPath(FRAME.boundary), realAxis: shapeToPath(FRAME.realAxis) }),
    [],
  );

  return (
    <svg
      ref={svgRef}
      className="smith-chart"
      viewBox={viewBoxAttribute()}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Smith Chart"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <defs>
        <clipPath id={CLIP_ID}>
          <circle cx={0} cy={0} r={CHART_RADIUS} />
        </clipPath>
      </defs>

      <circle className="chart-disc" cx={0} cy={0} r={CHART_RADIUS} />

      <g clipPath={`url(#${CLIP_ID})`}>
        {showAdmittanceGrid && <ChartGrid curves={ADMITTANCE_GRID} />}
        {showImpedanceGrid && <ChartGrid curves={IMPEDANCE_GRID} />}
        <path className="chart-axis" d={frame.realAxis} />
        {cursor && <CursorOverlay gamma={cursor} />}
      </g>

      <path className="chart-boundary" d={frame.boundary} />

      <g className="chart-center">
        <circle className="center-ring" cx={0} cy={0} r={11} />
        <circle className="center-dot" cx={0} cy={0} r={3.5} />
        <title>Matched load: z = 1, Γ = 0</title>
      </g>

      {showImpedanceGrid && <ChartLabels labels={LABELS} />}
    </svg>
  );
}
