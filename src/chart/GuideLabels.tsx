import { memo } from 'react';
import { type GuideAnnotation, gammaToSvg } from '../geometry';

interface GuideLabelsProps {
  readonly annotations: readonly GuideAnnotation[];
  /** SVG user units per screen pixel: labels keep a constant on-screen size. */
  readonly unitsPerPixel: number;
}

const FONT = 11; // px

/**
 * Radial-guide extensions (unit circle → outer scale ring) and their
 * wavelength readings outside the outer ring. Layout: geometry/guide-annotations.ts.
 */
export const GuideLabels = memo(function GuideLabels({ annotations, unitsPerPixel: u }: GuideLabelsProps) {
  return (
    <g className="guide-labels" aria-hidden="true">
      {annotations.map((a) => {
        const from = gammaToSvg(a.boundary);
        const to = gammaToSvg(a.extensionEnd);
        const rotation = (-a.textAngle * 180) / Math.PI;
        return (
          <g key={a.id} className={a.full ? 'guide-annotation full' : 'guide-annotation'}>
            <path className="guide-extension" d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} />
            {a.lines.map((line, i) => {
              const p = gammaToSvg(line.position);
              return (
                <text
                  key={i}
                  className="guide-label"
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${rotation.toFixed(3)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
                  style={{ fontSize: FONT * u, strokeWidth: 3 * u }}
                >
                  {line.text}
                </text>
              );
            })}
          </g>
        );
      })}
    </g>
  );
});
