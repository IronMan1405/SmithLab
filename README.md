# SmithLab

An interactive, freeform Smith Chart workspace. SmithLab aims to be a
mathematical instrument rather than a form-based impedance calculator.

**Status: Milestone 1.** This milestone covers the mathematical engine, the
geometry engine, and a mathematically generated SVG Smith Chart with light and
dark themes. Interactive point manipulation, transmission lines, circuit
elements and persistence are planned for later milestones.

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
├── chart/         Rendering. Maps geometry to SVG; contains no Smith maths.
│   ├── svg-path.ts       Shape → SVG path data (pure, tested)
│   ├── screen.ts         Client (screen) pixels → SVG user space
│   ├── SmithChart.tsx    The <svg>: frame, grids, labels, clipping, pointer
│   ├── ChartGrid.tsx
│   ├── ChartLabels.tsx
│   ├── CursorOverlay.tsx Read-only hover overlay
│   └── chart.css
│
├── components/    Application UI (toolbar, theme switcher, point inspector)
├── styles/        themes.css (all colour/weight tokens), global.css
├── App.tsx
└── main.tsx

tests/             Vitest suites for core, geometry and SVG path generation
```

Dependencies point one way only: `core ← geometry ← chart ← components/App`.
`core` and `geometry` are plain TypeScript and can be reused in a worker, a
CLI, or a Tauri backend.

### Layer responsibilities

| Layer | Knows about | Does not know about |
|-------|-------------|---------------------|
| `core` | complex numbers, z, y, Γ, VSWR | geometry, SVG, React |
| `geometry` | circles and arcs in the Γ-plane, grid layout, label anchors | SVG pixels, React, CSS |
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
3. **Screen.** The browser maps user space to the screen with `preserveAspectRatio="xMidYMid meet"`, which applies a uniform scale, so the chart is never distorted. `chart/screen.ts` inverts the element's screen CTM, and `svgToGamma` completes the trip back to Γ.

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

## What the UI does today

- A mathematically generated impedance Smith Chart, with resistance and ±reactance labels and a marked matched-load centre.
- An optional admittance (Y) grid overlay.
- A **point inspector**: hovering shows Γ (rectangular and polar), z, y, Z at Z₀ = 50 Ω, VSWR and return loss at the pointer. It also draws the constant-r circle, constant-x arc and constant-|Γ| circle through that point. This is read-only. It exercises the full screen → Γ → core pipeline, but points cannot yet be created or dragged.

---

## Known limitations

- **Z₀ is fixed at 50 Ω in the inspector.** Every core function accepts any real Z₀, but there is no UI to change it yet.
- **Labels scale with the chart.** On very small viewports (under about 350 px chart diameter), labels become small. Size-aware label density is a future refinement.
- **The admittance grid has no labels.** Its labels would collide with the impedance labels. A Y-only display mode with its own labels is planned.
- **Precision near Γ = +1.** Computing `z = (1 + Γ)/(1 − Γ)` close to the open-circuit point loses relative precision to cancellation in `1 − Γ`. This is inherent to the representation. Values stay finite and are correct to about `ε/|1 − Γ|`.
- **Tooling advisories.** `npm audit` reports advisories in Vitest 3's transitive dev dependencies (`tinypool`, `@vitest/mocker`). They affect the local test runner only, not the shipped app. The patched Vitest (≥ 4.1.11) needs Node 20+. Upgrading Node and Vitest is recommended.
