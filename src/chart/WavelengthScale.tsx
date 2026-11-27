import { memo } from 'react';
import { arg } from '../core';
import { type ChartLabel, buildWavelengthScale, gammaToSvg, uprightTangentAngle } from '../geometry';
import { shapeToPath } from './svg-path';

const SCALE = buildWavelengthScale();
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
const LABEL_SIZE = 28;
const TITLE_SIZE = 30;

/** SVG rotation (degrees) that lays text along the circle at Γ-angle φ, upright. */
export function tangentRotation(phi: number): number {
  // Γ-plane angles are anticlockwise-positive; SVG rotation is clockwise-positive.
  return (-uprightTangentAngle(phi) * 180) / Math.PI;
}

/** Numbers set along their strip (tangential, upright), centred on the strip. */
function StripLabels({ labels, zoom }: { labels: readonly ChartLabel[]; zoom: number }) {
  return (
    <g className="scale-labels">
      {labels.map((label) => {
        const p = gammaToSvg(label.anchor);
        return (
          <text
            key={label.id}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(${tangentRotation(arg(label.anchor)).toFixed(3)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
            style={{ fontSize: LABEL_SIZE / zoom, strokeWidth: 4 / zoom }}
          >
            {label.text}
          </text>
        );
      })}
    </g>
  );
}

function StripTitle({ id, text, zoom }: { id: string; text: string; zoom: number }) {
  // Titles keep their screen size when zooming in, but don't grow when zoomed
  // out, so they always fit in the gap between two numbers.
  return (
    <text className="scale-title" style={{ fontSize: TITLE_SIZE / Math.max(zoom, 1) }} dominantBaseline="central">
      <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
        {text}
      </textPath>
    </text>
  );
}

/**
 * Three concentric rings: the shared tick ring in the middle, the
 * toward-generator strip (numbers + title) outside it closed by the outer
 * ring, and the toward-load strip inside it closed by the inner ring. Each
 * scale's ring, numbers and title are grouped together.
 */
export const WavelengthScale = memo(function WavelengthScale({ zoom }: { zoom: number }) {
  return (
    <g className="wavelength-scale" aria-label="Wavelength scales">
      <defs>
        <path id={GENERATOR_TITLE_ID} d={shapeToPath(SCALE.generatorTitlePath)} />
        <path id={LOAD_TITLE_ID} d={shapeToPath(SCALE.loadTitlePath)} />
      </defs>

      <g className="scale-reference">
        <path className="scale-ring" d={shapeToPath(SCALE.tickRing)} />
        <path className="scale-ticks" d={TICK_PATH} />
      </g>

      <g className="scale generator" aria-label="Wavelengths toward generator">
        <path className="scale-ring" d={shapeToPath(SCALE.outerRing)} />
        <StripLabels labels={SCALE.generatorLabels} zoom={zoom} />
        <StripTitle id={GENERATOR_TITLE_ID} text="WAVELENGTHS TOWARD GENERATOR →" zoom={zoom} />
      </g>

      <g className="scale load" aria-label="Wavelengths toward load">
        <path className="scale-ring" d={shapeToPath(SCALE.innerRing)} />
        <StripLabels labels={SCALE.loadLabels} zoom={zoom} />
        <StripTitle id={LOAD_TITLE_ID} text="WAVELENGTHS TOWARD LOAD →" zoom={zoom} />
      </g>
    </g>
  );
});
