# SmithLab

An interactive, freeform Smith Chart workspace. SmithLab aims to be a
mathematical instrument rather than a form-based impedance calculator.

**Status: Milestone 2 — interactive workspace.** Milestone 1 built the
mathematical engine, the geometry engine and a mathematically generated SVG
Smith Chart. Milestone 2 adds direct manipulation: you can click to place
impedance points, drag them, inspect their electrical quantities, change Z₀,
and pan and zoom the chart. Transmission lines, circuit elements and
persistence are planned for later milestones.

---

## Setup

Requirements: Node.js ≥ 18 (Node 20+ recommended, see *Known limitations*).

```bash
npm install
npm run dev        # start the dev server at http://localhost:5173
npm test           # run all mathematical and geometry tests (Vitest)
npm run typecheck  # TypeScript strict-mode check
npm run build      # typecheck + production build into dist/
```

---

## Architecture

```
src/
├── core/          Pure maths. No DOM, no React, no screen coordinates.
│   ├── complex.ts       Complex numbers on the extended plane ℂ ∪ {∞}
│   ├── impedance.ts     z = Z/Z₀ and back
│   ├── reflection.ts    Γ ↔ z
│   ├── admittance.ts    y = 1/z, Y ↔ y, Γ ↔ y
│   ├── vswr.ts          VSWR, |Γ| from VSWR, return loss
│   └── index.ts
│
├── geometry/      Chart geometry in the Γ-plane. Depends only on core.
│   ├── coordinates.ts        Γ-plane ↔ SVG user-space transform (documented)
│   ├── shapes.ts             Circle / arc / segment primitives, arc construction
│   ├── impedance-circles.ts  Constant-r circles, constant-x arcs
│   ├── admittance-circles.ts Constant-g circles, constant-b arcs
│   ├── vswr-circles.ts       Constant-|Γ| circles
│   ├── grid.ts               Declarative grid spec → list of curves
│   ├── labels.ts             Label anchors and directions in the Γ-plane
│   └── index.ts
│
├── workspace/     Workspace state. Pure TS; depends only on core.
│   ├── workspace.ts      Reducer: points {id, name, Γ}, selection, Z₀
│   ├── quantities.ts     z, Z, Γ, |Γ|, ∠Γ, VSWR, RL, y for a point (+ load kind)
│   └── disc.ts           Clamp to |Γ| ≤ 1; snap to match/short/open
│
├── chart/         Rendering. Maps geometry to SVG; contains no Smith maths.
│   ├── viewport.ts       Pan/zoom view model; screen ↔ SVG ↔ Γ (pure, tested)
│   ├── svg-path.ts       Shape → SVG path data (pure, tested)
│   ├── SmithChart.tsx    Pure renderer: frame, grids, labels, points, overlay
│   ├── ChartGrid.tsx, ChartLabels.tsx
│   ├── PointsLayer.tsx   Point markers, hit areas, focusable for keyboard
│   ├── SelectionOverlay.tsx  Constant r / x / |Γ| curves through the selection
│   └── chart.css
│
├── interaction/   Pointer and keyboard input.
│   ├── gestures.ts       Pure gesture state machine → commands (tested)
│   ├── keyboard.ts       Pure key → command mapping (tested)
│   ├── useChartInteraction.ts  DOM adapter: pointer capture, hit-testing, wheel
│   ├── useKeyboardShortcuts.ts, useElementSize.ts
│
├── components/    Application UI: toolbar, Z₀ control, inspector, point list,
│                  view controls, hover status, theme switcher
├── styles/        themes.css (all colour/weight tokens), global.css
├── App.tsx
└── main.tsx

tests/             Vitest suites for core, geometry and SVG path generation
```

Dependencies point one way only:
`core ← geometry ← chart ← components/App` and `core ← workspace ← interaction ← App`.
`core`, `geometry`, `workspace`, `chart/viewport.ts` and the `interaction`
state machines are plain TypeScript with no React, and can be reused in a
worker, a CLI or a Tauri backend.

### Interaction data flow

```
pointer / wheel / key event
  → useChartInteraction / useKeyboardShortcuts   (gather rect, hit target, modifiers)
  → gestures.ts / keyboard.ts                    (pure: decide, return commands)
  → App.applyCommand                             (the one place commands become state)
  → workspaceReducer / setView
  → SmithChart (pure render) + PointInspector (quantities from core)
```

### Layer responsibilities

| Layer | Knows about | Does not know about |
|-------|-------------|---------------------|
| `core` | complex numbers, z, y, Γ, VSWR | geometry, SVG, React |
| `geometry` | circles and arcs in the Γ-plane, grid layout, label anchors | SVG pixels, React, CSS |
| `workspace` | points, selection, Z₀, derived quantities | screen, SVG, React |
| `interaction` | pointer/keyboard semantics, thresholds | Smith Chart formulas, rendering |
| `chart` | SVG user space, the screen, React | Smith Chart formulas |

Each grid curve is built twice over. Its circle **centre and radius** come
from the closed-form equations in `geometry/*-circles.ts`. Its arc
**endpoints** come from mapping impedances through `core.reflectionFromImpedance`.
The tests check that the two agree.

---

## Mathematics

### Normalisation

```
z = Z / Z₀            y = 1 / z = Y · Z₀
```

`Z₀` must be a finite, strictly positive real number (lossless reference).
Complex reference impedances are rejected with a `RangeError`, because they need
the power-wave definition of Γ.

### Reflection coefficient

```
Γ = (z − 1) / (z + 1)          z = (1 + Γ) / (1 − Γ)
Γ = (1 − y) / (1 + y) = −Γ_z(y)
```

| Load | z | Γ |
|------|---|---|
| Short | 0 | −1 |
| Matched | 1 | 0 |
| Open | ∞ | +1 |
| Pole | −1 | ∞ |

Passive loads (Re z ≥ 0) lie in the closed unit disc |Γ| ≤ 1. Active loads
fall outside the disc. They are returned as-is rather than clamped, and
`isPassiveReflection()` identifies them.

### VSWR and return loss

```
VSWR = (1 + |Γ|) / (1 − |Γ|)          RL = −20 log₁₀ |Γ|  dB
```

- VSWR = 1 at a match and +∞ for |Γ| = 1 (open, short, pure reactance).
- For |Γ| > 1, VSWR throws a `RangeError` because the formula has no physical meaning there.
- RL = +∞ dB at Γ = 0 and 0 dB at |Γ| = 1. It is **negative** for |Γ| > 1 (reflection gain), and is reported rather than hidden.

### Chart geometry (Γ = u + jv)

```
constant r:  (u − r/(1+r))² + v² = (1/(1+r))²
constant x:  (u − 1)² + (v − 1/x)² = (1/x)²
constant g:  (u + g/(1+g))² + v² = (1/(1+g))²
constant b:  (u + 1)² + (v + 1/b)² = (1/b)²
constant |Γ|: u² + v² = |Γ|²
```

Positive reactance (inductive) is in the upper half. Positive susceptance
(capacitive) is in the lower half.

### Default grid

| Curves | Values | Extent |
|--------|--------|--------|
| Major r, labelled | 0.2, 0.5, 1, 2, 5, 10 | full circle |
| Minor r | 0.1, 0.3, 0.4, 0.6–0.9 | \|x\| ≤ 2 |
| Minor r | 1.5, 3, 4 | \|x\| ≤ 5 |
| Major ±x, labelled | 0.2, 0.5, 1, 2, 5, 10 | 0 ≤ r ≤ ∞ |
| Minor ±x | 0.1, 0.3, 0.4, 0.6–0.9 | r ≤ 2 |
| Minor ±x | 1.5, 3, 4 | r ≤ 5 |

Every minor curve ends exactly on a major curve, which keeps the area near
Γ = 1 readable. The grid is declared in `geometry/grid.ts` (`GridSpec`) and can
be replaced without touching the renderer. The admittance grid uses the same
spec.

---

## Numerical conventions

The full rationale is in the header comment of `src/core/complex.ts`.

1. **Representation.** Complex numbers are immutable `{ re, im }` records. Every function is pure.
2. **Extended complex plane.** There is a single point at infinity, `COMPLEX_INFINITY`. Any value with an infinite component counts as ∞. Test for it with `isInfinite()`.
   - `a/0 = ∞` (a ≠ 0) and `a/∞ = 0`.
   - `1/0 = ∞` and `1/∞ = 0`, so short ↔ y = ∞ and open ↔ y = 0.
   - The limits are exact: `Γ(∞) = 1` and `z(Γ = ∞) = −1`.
3. **Indeterminate forms.** `0/0`, `∞/∞`, `∞·0` and `∞ ± ∞` give NaN. Domain functions call `assertComplex()` and **throw** on NaN input rather than passing it on.
4. **Overflow.** Finite operands that overflow give ∞, not NaN. Division uses Smith's algorithm to avoid intermediate overflow.
5. **Boundary tolerance.** |Γ| is treated as on the unit circle within `BOUNDARY_TOLERANCE = 1e-12`. This absorbs round-off for pure reactances, so VSWR = ∞ rather than throwing.
6. **Argument.** `arg(0) = 0`, including signed zeros. `arg(∞)` is NaN.
7. **Invalid domain input throws `RangeError`.** This covers Z₀ ≤ 0, r < 0, VSWR < 1, |Γ| < 0, and |Γ| > 1 for VSWR.

---

## Coordinate systems

Full documentation is in `src/geometry/coordinates.ts`.

1. **Γ-plane.** This is the mathematical space, and all geometry lives here. +v points up.
2. **SVG user space.** This is a fixed viewBox with the unit circle at radius `CHART_RADIUS = 1000` and a 120-unit label margin:
   `x = u·R`, `y = −v·R` (y is negated because SVG's y axis points down).
3. **Screen.** The browser maps user space to the screen with `preserveAspectRatio="xMidYMid meet"`, which applies a uniform scale, so the chart is never distorted. `chart/viewport.ts` reproduces that mapping as pure functions (`screenToSvg`, `svgToScreen`, `screenToGamma`, `gammaToScreen`), taking the element's bounding rectangle as the only DOM input. This keeps the mapping unit-testable, and it was checked against the browser's own `getScreenCTM()`.

**Pan and zoom.** The view is `{ center: Γ, zoom }`. The viewBox is derived from it and is always square, so the chart stays circular at every zoom level and window size. Zoom anchors at the cursor, and pan keeps the grabbed point under the pointer. Zoom is limited to 0.8×–500×, and the centre is kept within ±1.25 so the chart can't be lost off-screen. Point markers, labels and line weights keep a constant on-screen size.

Stroke widths are given in CSS pixels with `vector-effect: non-scaling-stroke`,
so line weights stay the same at every chart size.

---

## Theming

All colours and line weights are CSS custom properties in
`src/styles/themes.css`, scoped by `[data-theme='light' | 'dark']` on `<html>`.
Components only use these variables. To add a theme, add another
`[data-theme='…']` block that defines the same tokens.

The switcher offers Light, Dark and System. The preference is stored in
`localStorage`. A small inline script in `index.html` applies the theme before
first paint to prevent a flash of the wrong theme.

---

## Using the workspace

| Action | Result |
|--------|--------|
| Click inside the chart | Create a point at that Γ and select it |
| Click outside the chart | Deselect |
| Press and drag a point | Select and move it; values update live |
| Drag the background (or middle-drag anywhere) | Pan |
| Scroll / pinch | Zoom at the cursor |
| − / + / Fit buttons, or `−` `+` `0` | Zoom out / in / reset view |
| Arrow keys (Shift ×10) | Nudge the selected point |
| Delete / Backspace | Delete the selected point |
| Esc | Deselect |
| Tab | Focus (and select) points in turn |
| Hold Alt while placing or dragging | Disable snapping |

Interaction rules:

- **Thresholds.** A press only becomes a drag or pan after moving more than 4 px. A click on a point therefore never nudges it, and a pan never creates a point.
- **Priority.** A hit on a point always wins over the background. The selected point is drawn last, so it is on top for hit-testing. Hit areas are 14 px in radius, larger than the visible marker.
- **Grab offset.** Dragging keeps the offset between the cursor and the point, so the point doesn't jump when picked up.
- **Clamping.** Points are always kept within |Γ| ≤ 1. Dragging past the edge slides the point along the boundary, giving a lossless load.
- **Snapping.** Within 8 px of Γ = 0, −1 or +1, a point snaps to an exact matched load, short or open circuit. This makes those cases reachable by hand.
- **Keyboard and text fields.** Keyboard shortcuts are inactive while typing in a text field, so Backspace in the name field never deletes a point.

### Point inspector

For the selected point it shows z, Z (at the current Z₀), Γ, |Γ|, ∠Γ, VSWR,
return loss and y, with a badge for matched, short, open or lossless loads. The
name can be edited inline. Special cases:

- **Matched (Γ = 0):** VSWR 1, return loss ∞ dB, phase shown as undefined.
- **Short:** z = 0, y = ∞.
- **Open:** z = Z = ∞, y = 0.
- **On the boundary:** r and g are exactly 0, removing ±1e-16 round-off.

### Characteristic impedance

The Z₀ field in the toolbar applies valid positive values immediately. Invalid
entries are flagged and revert when the field loses focus. Points are stored by
Γ (the chart coordinate), so **changing Z₀ keeps every point where it is**: its
normalised z is unchanged and its physical Z = z·Z₀ is re-derived.

---

## Known limitations

- **No pinch-zoom on touch screens.** Touch supports tap-to-create, dragging points and one-finger pan. Trackpad pinch works, because it arrives as ctrl+wheel. Two-finger touch pinch is not yet implemented.
- **The grid doesn't adapt to zoom.** At high zoom the default grid becomes sparse. A grid whose density follows the zoom level is a later refinement.
- **No undo.** Clear all asks for confirmation, but deleting a single point and moving points can't be undone yet.
- **Workspace is not persisted.** Reloading the page clears points (persistence is out of scope).
- **Labels scale with the chart.** On very small viewports (under about 350 px chart diameter), labels become small. Size-aware label density is a future refinement.
- **The admittance grid has no labels.** Its labels would collide with the impedance labels. A Y-only display mode with its own labels is planned.
- **Precision near Γ = +1.** Computing `z = (1 + Γ)/(1 − Γ)` close to the open-circuit point loses relative precision to cancellation in `1 − Γ`. This is inherent to the representation. Values stay finite and are correct to about `ε/|1 − Γ|`.
- **Tooling advisories.** `npm audit` reports advisories in Vitest 3's transitive dev dependencies (`tinypool`, `@vitest/mocker`). They affect the local test runner only, not the shipped app. The patched Vitest (≥ 4.1.11) needs Node 20+. Upgrading Node and Vitest is recommended.
