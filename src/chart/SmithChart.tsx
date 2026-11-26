import { type PointerEvent, type Ref, memo } from 'react';
import {
  CHART_RADIUS,
  buildAdmittanceGrid,
  buildChartFrame,
  buildImpedanceGrid,
  reactanceBoundaryLabels,
  resistanceAxisLabels,
  viewBoxAttribute,
} from '../geometry';
import type { Gesture } from '../interaction/gestures';
import type { PointQuantities, ResolvedPoint } from '../workspace';
import { ChartGrid } from './ChartGrid';
import { ChartLabels } from './ChartLabels';
import { type CurveVisual, CurvesLayer, InspectionMarks } from './CurvesLayer';
import { PointsLayer } from './PointsLayer';
import { SelectionOverlay } from './SelectionOverlay';
import { type LineVisual, TransmissionLineLayer } from './TransmissionLineLayer';
import { WavelengthScale } from './WavelengthScale';
import { shapeToPath } from './svg-path';
import { type View, viewBoxOf } from './viewport';
import './chart.css';

export interface SmithChartProps {
  readonly ref?: Ref<SVGSVGElement>;
  readonly view: View;
  /** SVG user units per screen pixel at the current view (0 before layout). */
  readonly unitsPerPixel: number;
  readonly showImpedanceGrid: boolean;
  readonly showAdmittanceGrid: boolean;
  readonly showWavelengthScales: boolean;
  readonly points: readonly ResolvedPoint[];
  readonly lines: readonly LineVisual[];
  readonly curves: readonly CurveVisual[];
  readonly probe: import('../core').Complex | null;
  readonly intersections: readonly { readonly gamma: import('../core').Complex; readonly active: boolean }[];
  readonly selectedId: string | null;
  readonly selection: PointQuantities | null;
  /** The selection is a line's load or input, whose |Γ| path is already drawn. */
  readonly selectionOnLinePath: boolean;
  readonly gestureKind: Gesture['kind'];
  readonly onFocusPoint: (id: string) => void;
  readonly pointerHandlers: {
    readonly onPointerDown: (e: PointerEvent<SVGSVGElement>) => void;
    readonly onPointerMove: (e: PointerEvent<SVGSVGElement>) => void;
    readonly onPointerUp: (e: PointerEvent<SVGSVGElement>) => void;
    readonly onPointerCancel: (e: PointerEvent<SVGSVGElement>) => void;
    readonly onPointerLeave: () => void;
  };
}

const CLIP_ID = 'smithlab-unit-disc';

// Grid geometry is static: compute it once at module load.
const FRAME = buildChartFrame();
const BOUNDARY_PATH = shapeToPath(FRAME.boundary);
const AXIS_PATH = shapeToPath(FRAME.realAxis);
const IMPEDANCE_GRID = buildImpedanceGrid();
const ADMITTANCE_GRID = buildAdmittanceGrid();
const LABELS = [...resistanceAxisLabels(), ...reactanceBoundaryLabels()];

/**
 * Pure renderer: draws the chart for a given view and set of points.
 * Interaction is supplied from outside via `pointerHandlers` and `ref`.
 */
export const SmithChart = memo(function SmithChart(props: SmithChartProps) {
  const { ref, view, unitsPerPixel, points, lines, selectedId, selection, gestureKind, pointerHandlers } = props;
  const centerScale = 1 / view.zoom;

  return (
    <svg
      ref={ref}
      className="smith-chart"
      data-gesture={gestureKind}
      viewBox={viewBoxAttribute(viewBoxOf(view))}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      aria-label="Smith Chart workspace. Click inside the chart to add an impedance point."
      {...pointerHandlers}
    >
      <defs>
        <clipPath id={CLIP_ID}>
          <circle cx={0} cy={0} r={CHART_RADIUS} />
        </clipPath>
      </defs>

      <circle className="chart-disc" cx={0} cy={0} r={CHART_RADIUS} />

      <g clipPath={`url(#${CLIP_ID})`}>
        {props.showAdmittanceGrid && <ChartGrid curves={ADMITTANCE_GRID} />}
        {props.showImpedanceGrid && <ChartGrid curves={IMPEDANCE_GRID} />}
        <path className="chart-axis" d={AXIS_PATH} />
        {selection && (
          <SelectionOverlay
            gamma={selection.gamma}
            z={selection.z}
            gammaMagnitude={selection.gammaMagnitude}
            showVswrCircle={!props.selectionOnLinePath}
          />
        )}
        {unitsPerPixel > 0 && <TransmissionLineLayer lines={lines} unitsPerPixel={unitsPerPixel} />}
        {unitsPerPixel > 0 && <CurvesLayer curves={props.curves} unitsPerPixel={unitsPerPixel} />}
      </g>

      <path className="chart-boundary" d={BOUNDARY_PATH} />

      <g className="chart-center">
        <circle className="center-ring" cx={0} cy={0} r={11 * centerScale} />
        <circle className="center-dot" cx={0} cy={0} r={3.5 * centerScale} />
      </g>

      {props.showImpedanceGrid && <ChartLabels labels={LABELS} zoom={view.zoom} />}
      {props.showWavelengthScales && <WavelengthScale zoom={view.zoom} />}

      {unitsPerPixel > 0 && (
        <InspectionMarks probe={props.probe} intersections={props.intersections} unitsPerPixel={unitsPerPixel} />
      )}

      {unitsPerPixel > 0 && (
        <PointsLayer points={points} selectedId={selectedId} unitsPerPixel={unitsPerPixel} onFocusPoint={props.onFocusPoint} />
      )}
    </svg>
  );
});
