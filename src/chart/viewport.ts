/**
 * Viewport: pan/zoom state and the screen ↔ SVG ↔ Γ mappings.
 *
 * View model
 * ----------
 * A view is `{ center, zoom }`: the Γ-plane point at the middle of the
 * chart area, and a magnification relative to the default fit (zoom = 1,
 * which shows the full unit circle plus label margin). The SVG viewBox is
 * derived from it and is always square, so with
 * preserveAspectRatio="xMidYMid meet" the chart is uniformly scaled and can
 * never become elliptical.
 *
 * Screen mapping
 * --------------
 * `screenToSvg`/`svgToScreen` reproduce exactly what the browser does for a
 * viewBox with "xMidYMid meet": scale s = min(w/vbW, h/vbH), centred in the
 * element's box. Implementing it here (instead of asking the DOM for the
 * screen CTM) keeps the mapping pure and unit-testable; the element's
 * bounding rectangle is the only DOM input.
 */
import { type Complex, abs, add, complex, scale, sub } from '../core';
import { CHART_RADIUS, CHART_VIEWBOX, type Point, type ViewBox, gammaToSvg, svgToGamma } from '../geometry';

export interface View {
  readonly center: Complex;
  readonly zoom: number;
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_VIEW: View = Object.freeze({ center: complex(0, 0), zoom: 1 });
export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 500;
/** The view centre may not leave this square in the Γ-plane, so the chart can't be lost. */
export const MAX_CENTER_OFFSET = 1.25;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function clampView(view: View): View {
  return {
    center: complex(
      clamp(view.center.re, -MAX_CENTER_OFFSET, MAX_CENTER_OFFSET),
      clamp(view.center.im, -MAX_CENTER_OFFSET, MAX_CENTER_OFFSET),
    ),
    zoom: clamp(view.zoom, MIN_ZOOM, MAX_ZOOM),
  };
}

export function viewBoxOf(view: View): ViewBox {
  const width = CHART_VIEWBOX.width / view.zoom;
  const height = CHART_VIEWBOX.height / view.zoom;
  const c = gammaToSvg(view.center);
  return { minX: c.x - width / 2, minY: c.y - height / 2, width, height };
}

interface MeetTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

function meet(rect: Rect, box: ViewBox): MeetTransform {
  const s = Math.min(rect.width / box.width, rect.height / box.height);
  return {
    scale: s,
    offsetX: rect.left + (rect.width - box.width * s) / 2 - box.minX * s,
    offsetY: rect.top + (rect.height - box.height * s) / 2 - box.minY * s,
  };
}

export function isUsableRect(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/** Client (screen) pixels → SVG user units. */
export function screenToSvg(point: Point, rect: Rect, box: ViewBox): Point {
  const t = meet(rect, box);
  return { x: (point.x - t.offsetX) / t.scale, y: (point.y - t.offsetY) / t.scale };
}

/** SVG user units → client (screen) pixels. */
export function svgToScreen(point: Point, rect: Rect, box: ViewBox): Point {
  const t = meet(rect, box);
  return { x: point.x * t.scale + t.offsetX, y: point.y * t.scale + t.offsetY };
}

export function screenToGamma(point: Point, rect: Rect, view: View): Complex {
  return svgToGamma(screenToSvg(point, rect, viewBoxOf(view)));
}

export function gammaToScreen(gamma: Complex, rect: Rect, view: View): Point {
  return svgToScreen(gammaToSvg(gamma), rect, viewBoxOf(view));
}

/** Screen pixels per SVG user unit. */
export function pixelsPerSvgUnit(rect: Rect, view: View): number {
  return meet(rect, viewBoxOf(view)).scale;
}

/** Γ-plane distance covered by one screen pixel. */
export function gammaPerPixel(rect: Rect, view: View): number {
  return 1 / (pixelsPerSvgUnit(rect, view) * CHART_RADIUS);
}

/**
 * Zoom by `factor` keeping the Γ-plane point `anchor` fixed on screen
 * (zoom-to-cursor). The factor is limited so zoom stays within bounds.
 */
export function zoomAbout(view: View, anchor: Complex, factor: number): View {
  if (!(factor > 0) || !Number.isFinite(factor)) return view;
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const applied = zoom / view.zoom;
  // center' = anchor + (center − anchor)/applied  keeps anchor at the same screen spot.
  const center = add(anchor, scale(sub(view.center, anchor), 1 / applied));
  return clampView({ center, zoom });
}

/**
 * The view after dragging the chart from client point `from` to `to`, with
 * both points interpreted in the view that was active when the drag began.
 * This keeps panning stable: the grabbed chart point stays under the cursor.
 */
export function panView(startView: View, rect: Rect, from: Point, to: Point): View {
  const delta = sub(screenToGamma(to, rect, startView), screenToGamma(from, rect, startView));
  return clampView({ center: sub(startView.center, delta), zoom: startView.zoom });
}

export function isDefaultView(view: View): boolean {
  return view.zoom === DEFAULT_VIEW.zoom && abs(view.center) === 0;
}
