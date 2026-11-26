import { type View, isDefaultView } from '../chart/viewport';

interface ViewControlsProps {
  readonly view: View;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
}

export function ViewControls({ view, onZoomIn, onZoomOut, onFit }: ViewControlsProps) {
  return (
    <div className="view-controls" role="toolbar" aria-label="Chart view">
      <button type="button" onClick={onZoomOut} title="Zoom out (−)" aria-label="Zoom out">
        −
      </button>
      <span className="zoom-level" aria-live="polite">
        {Math.round(view.zoom * 100)}%
      </span>
      <button type="button" onClick={onZoomIn} title="Zoom in (+)" aria-label="Zoom in">
        +
      </button>
      <button type="button" onClick={onFit} disabled={isDefaultView(view)} title="Fit chart (0)">
        Fit
      </button>
    </div>
  );
}
