import { describe, expect, it } from 'vitest';
import { complex } from '../src/core';
import { CHART_RADIUS, CHART_VIEWBOX, gammaToSvg } from '../src/geometry';
import {
  DEFAULT_VIEW,
  MAX_CENTER_OFFSET,
  MAX_ZOOM,
  MIN_ZOOM,
  type Rect,
  type View,
  clampView,
  gammaPerPixel,
  gammaToScreen,
  panView,
  pixelsPerSvgUnit,
  screenToGamma,
  screenToSvg,
  svgToScreen,
  viewBoxOf,
  zoomAbout,
} from '../src/chart/viewport';
import { expectComplexClose } from './helpers';

// A landscape element offset from the page origin: height limits the scale.
const RECT: Rect = { left: 100, top: 50, width: 800, height: 600 };
const SCALE = 600 / CHART_VIEWBOX.width;
const CENTER = { x: 500, y: 350 };

describe('viewBox from view', () => {
  it('default view reproduces the Milestone 1 viewBox', () => {
    expect(viewBoxOf(DEFAULT_VIEW)).toEqual(CHART_VIEWBOX);
  });

  it('is always square, and shrinks with zoom around the centre', () => {
    const box = viewBoxOf({ center: complex(0.5, 0.25), zoom: 4 });
    expect(box.width).toBe(box.height);
    expect(box.width).toBeCloseTo(CHART_VIEWBOX.width / 4, 9);
    expect(box.minX + box.width / 2).toBeCloseTo(500, 9);
    expect(box.minY + box.height / 2).toBeCloseTo(-250, 9); // +v is up ⇒ negative SVG y
  });
});

describe('screen ↔ chart conversion', () => {
  it('maps the chart centre to the centre of the element', () => {
    const p = gammaToScreen(complex(0, 0), RECT, DEFAULT_VIEW);
    expect(p.x).toBeCloseTo(CENTER.x, 9);
    expect(p.y).toBeCloseTo(CENTER.y, 9);
    expectComplexClose(screenToGamma(CENTER, RECT, DEFAULT_VIEW), complex(0, 0));
  });

  it('uses a uniform scale (meet) so the chart stays circular', () => {
    const right = gammaToScreen(complex(1, 0), RECT, DEFAULT_VIEW);
    const top = gammaToScreen(complex(0, 1), RECT, DEFAULT_VIEW);
    expect(right.x - CENTER.x).toBeCloseTo(CHART_RADIUS * SCALE, 9);
    expect(CENTER.y - top.y).toBeCloseTo(CHART_RADIUS * SCALE, 9); // +v is up on screen
    expect(pixelsPerSvgUnit(RECT, DEFAULT_VIEW)).toBeCloseTo(SCALE, 12);
    // Portrait element: width limits the scale, still uniform.
    const tall: Rect = { left: 0, top: 0, width: 300, height: 900 };
    const r = gammaToScreen(complex(1, 0), tall, DEFAULT_VIEW);
    const t = gammaToScreen(complex(0, 1), tall, DEFAULT_VIEW);
    expect(r.x - 150).toBeCloseTo(450 - t.y, 9);
  });

  it('screen → Γ: a known screen point gives z = 1 + j1', () => {
    const px = CHART_RADIUS * SCALE;
    const gamma = screenToGamma({ x: CENTER.x + 0.2 * px, y: CENTER.y - 0.4 * px }, RECT, DEFAULT_VIEW);
    expectComplexClose(gamma, complex(0.2, 0.4), 1e-12);
  });

  it('round-trips Γ → screen → Γ under arbitrary views', () => {
    const views: View[] = [DEFAULT_VIEW, { center: complex(0.3, -0.6), zoom: 7.5 }, { center: complex(-1, 1), zoom: 0.9 }];
    for (const view of views) {
      for (const gamma of [complex(0, 0), complex(0.9, -0.1), complex(-0.5, 0.5), complex(1, 0)]) {
        expectComplexClose(screenToGamma(gammaToScreen(gamma, RECT, view), RECT, view), gamma, 1e-12);
      }
    }
  });

  it('round-trips screen → SVG → screen', () => {
    const box = viewBoxOf({ center: complex(0.1, 0.2), zoom: 3 });
    const p = { x: 123.4, y: 567.8 };
    const back = svgToScreen(screenToSvg(p, RECT, box), RECT, box);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
    // SVG mapping is consistent with the geometry layer's Γ → SVG transform.
    const svg = screenToSvg(gammaToScreen(complex(0.25, 0.5), RECT, DEFAULT_VIEW), RECT, CHART_VIEWBOX);
    const expected = gammaToSvg(complex(0.25, 0.5));
    expect(svg.x).toBeCloseTo(expected.x, 9);
    expect(svg.y).toBeCloseTo(expected.y, 9);
  });

  it('Γ per pixel scales inversely with zoom', () => {
    const base = gammaPerPixel(RECT, DEFAULT_VIEW);
    expect(base).toBeCloseTo(1 / (CHART_RADIUS * SCALE), 15);
    expect(gammaPerPixel(RECT, { center: complex(0, 0), zoom: 10 })).toBeCloseTo(base / 10, 15);
  });
});

describe('zoom', () => {
  it('keeps the anchor point fixed on screen', () => {
    const anchor = complex(0.6, -0.3);
    const before = gammaToScreen(anchor, RECT, DEFAULT_VIEW);
    const zoomed = zoomAbout(DEFAULT_VIEW, anchor, 3);
    expect(zoomed.zoom).toBe(3);
    const after = gammaToScreen(anchor, RECT, zoomed);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('is clamped to [MIN_ZOOM, MAX_ZOOM] and ignores invalid factors', () => {
    expect(zoomAbout(DEFAULT_VIEW, complex(0, 0), 1e9).zoom).toBe(MAX_ZOOM);
    expect(zoomAbout(DEFAULT_VIEW, complex(0, 0), 1e-9).zoom).toBe(MIN_ZOOM);
    expect(zoomAbout(DEFAULT_VIEW, complex(0, 0), NaN)).toBe(DEFAULT_VIEW);
    expect(zoomAbout(DEFAULT_VIEW, complex(0, 0), -2)).toBe(DEFAULT_VIEW);
  });
});

describe('pan', () => {
  it('keeps the grabbed chart point under the pointer', () => {
    const start = { x: 400, y: 300 };
    const end = { x: 460, y: 250 };
    const grabbed = screenToGamma(start, RECT, DEFAULT_VIEW);
    const panned = panView(DEFAULT_VIEW, RECT, start, end);
    expectComplexClose(screenToGamma(end, RECT, panned), grabbed, 1e-12);
    expect(panned.zoom).toBe(1);
  });

  it('clamps the centre so the chart cannot be lost', () => {
    const far = panView(DEFAULT_VIEW, RECT, { x: 0, y: 0 }, { x: -1e6, y: 1e6 });
    expect(far.center.re).toBe(MAX_CENTER_OFFSET);
    expect(far.center.im).toBe(MAX_CENTER_OFFSET);
    expect(clampView({ center: complex(-9, 0), zoom: 1 }).center.re).toBe(-MAX_CENTER_OFFSET);
  });
});
