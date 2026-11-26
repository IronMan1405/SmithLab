import { memo } from 'react';
import { type ChartLabel, buildWavelengthScale, gammaToSvg } from '../geometry';
import { labelAlignment } from './ChartLabels';
import { shapeToPath } from './svg-path';

const SCALE = buildWavelengthScale();
const RING_PATH = shapeToPath(SCALE.ring);
const TICK_PATH = SCALE.ticks
  .map((t) => {
    const a = gammaToSvg(t.inner);
    const b = gammaToSvg(t.outer);
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  })
  .join(' ');
const GENERATOR_TITLE_ID = 'smithlab-wtg-title';
const LOAD_TITLE_ID = 'smithlab-wtl-title';

/** Sizes in SVG user units at zoom 1. */
const LABEL_SIZE = 30;
const TITLE_SIZE = 27;

function ScaleLabels({ labels, zoom, className }: { labels: readonly ChartLabel[]; zoom: number; className: string }) {
  return (
    <g className={className}>
      {labels.map((label) => {
        const p = gammaToSvg(label.anchor);
        const { anchor, baseline } = labelAlignment(label.direction);
        return (
          <text
            key={label.id}
            x={p.x}
            y={p.y}
            textAnchor={anchor}
            dominantBaseline={baseline}
            style={{ fontSize: LABEL_SIZE / zoom, strokeWidth: 5 / zoom }}
          >
            {label.text}
          </text>
        );
      })}
    </g>
  );
}

/**
 * Wavelengths-toward-generator (outer row, clockwise) and
 * wavelengths-toward-load (inner row, counter-clockwise) scales.
 */
export const WavelengthScale = memo(function WavelengthScale({ zoom }: { zoom: number }) {
  return (
    <g className="wavelength-scale" aria-label="Wavelength scales">
      <defs>
        <path id={GENERATOR_TITLE_ID} d={shapeToPath(SCALE.generatorTitlePath)} />
        <path id={LOAD_TITLE_ID} d={shapeToPath(SCALE.loadTitlePath)} />
      </defs>
      <path className="scale-ring" d={RING_PATH} />
      <path className="scale-ticks" d={TICK_PATH} />
      <ScaleLabels labels={SCALE.loadLabels} zoom={zoom} className="scale-labels load" />
      <ScaleLabels labels={SCALE.generatorLabels} zoom={zoom} className="scale-labels generator" />
      <text className="scale-title generator" style={{ fontSize: TITLE_SIZE / zoom }}>
        <textPath href={`#${GENERATOR_TITLE_ID}`} startOffset="50%" textAnchor="middle">
          WAVELENGTHS TOWARD GENERATOR →
        </textPath>
      </text>
      <text className="scale-title load" style={{ fontSize: TITLE_SIZE / zoom }}>
        <textPath href={`#${LOAD_TITLE_ID}`} startOffset="50%" textAnchor="middle">
          WAVELENGTHS TOWARD LOAD →
        </textPath>
      </text>
    </g>
  );
});
