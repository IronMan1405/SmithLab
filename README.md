# SmithLab

**A mathematical playground for RF engineering.**

SmithLab is an interactive, expression-driven workspace built around the Smith
Chart. Instead of filling in a form and reading off an answer, you write the
relationships yourself — loads, lines, elements, circles, intersections — and
SmithLab keeps the whole construction live. Change a value, drag a point or
move a slider, and everything that depends on it moves with it.

```
zL = 0.6 + j0.8                    ← drag this point on the chart
vswrL = vswrCircle(zL)
pA = intersect(vswrL, rCircle(1))  ← follows zL as you drag
l = 0.1                            ← attach a slider
zIn = line(zL, l)
```

SmithLab runs entirely in the browser. SmithLab is preparing for its first public beta release (v0.9.0).

## Philosophy

- **An instrument, not a calculator.** The freedom of a graphing calculator
  such as Desmos, applied to RF engineering: compose expressions, define
  dependencies, attach sliders to parameters, build geometry, and explore.
- **The text is the source of truth.** Expressions are defined by their text,
  not by hidden parameter state. Sliders and point drags update that text directly,
  so what you see is always what is defined.
- **Exact geometry.** Circles, arcs, line paths and element sweeps are
  computed in closed form and drawn as true arcs, and their intersections are
  found analytically. Numerical methods are used only for general parametric
  curves, and their results are marked as numerical.
- **Values that know what they mean.** Numbers carry a type — normalised
  impedance, admittance, reflection coefficient, ohms, wavelengths — so
  physically meaningless operations, such as adding an impedance to an
  admittance, are rejected with an explanation.
- **Views do not change the mathematics.** Switching between impedance and
  admittance coordinates changes where numbers are drawn, never their values.

## What you can do

- **Place and drag points** directly on the chart and read z, Z, Γ, |Γ|, ∠Γ,
  VSWR, return loss and y in the inspector.
- **Write expressions** with complex arithmetic, typed RF values, a naming
  convention (`zL`, `yL`, `gammaL`, `ZL`, `l…`), and named dependencies that
  re-evaluate incrementally.
- **Attach sliders** to any `name = number` row and drag points defined by
  literal expressions; both rewrite the expression text.
- **Model networks** with lossless transmission lines (`line`), series and
  shunt elements (`series`, `shunt`), and stubs built from those.
- **Construct curves**: constant-VSWR, r, x, g and b circles, line paths,
  radial guides, exact series/shunt element sweeps (`seriesPath`,
  `shuntPath`), exact rotations, and arbitrary parametric curves Γ(t).
- **Intersect and probe curves** with `intersect()` and `at()`, or in the curve
  inspector, which lists every intersection and turns any of them into an
  expression.
- **Read the chart** with impedance and admittance grids, impedance or
  admittance coordinates, wavelength scales toward generator and load, and
  radial guides with wavelength readings.
- **Change Z₀** and watch expressions in ohms update.
- **Look things up** in the built-in expression reference, generated from the
  live function registry, with runnable examples.
- Pan and zoom, keyboard control, and light and dark themes.

A short tour of matching a load with an L-network:

```
zM = 2
zM1 = shunt(zM, j0.5)               ← shunt capacitor onto the r = 1 circle
zM2 = series(zM1, j1)               ← series inductor to the centre: 1 + j0
shuntM = shuntPath(zM, -j2, j2)     ← the exact arc the shunt element sweeps
sweepM = seriesPath(zM1, -j2, j2)   ← the exact arc the series element sweeps
```

More in [Examples](docs/examples.md).

## Getting started

Requirements: [Node.js](https://nodejs.org/) 22 or newer, and a modern
browser.

```bash
npm ci
npm run dev
```

Then open <http://localhost:5173>. Other commands:

| Command | What it does |
|---|---|
| `npm test` | Run the test suite (Vitest) |
| `npm run test:watch` | Run the tests in watch mode |
| `npm run typecheck` | TypeScript strict-mode check |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the production build locally |

The production build is a static site with no server component, so `dist/`
can be served from any static host.

## Documentation

- [User guide](docs/user-guide.md): the chart, inspectors, transmission lines,
  radial guides, coordinate modes and Z₀.
- [Expressions](docs/expressions.md): syntax, types, every function, curves,
  sliders and dragging.
- [Examples](docs/examples.md): ready-to-paste workspaces.
- [Mathematics](docs/mathematics.md): formulas, exact sweeps, chart modes,
  wavelength scales and numerical conventions.
- [Architecture](docs/architecture.md): source layout, layers and data flow.
- [Changelog](CHANGELOG.md).

## Current limitations

SmithLab is a beta. In particular:

- **No saving.** Points and expressions are lost when the page is reloaded.
  Only the colour theme is remembered.
- **No undo.**
- **Lossless lines only**, with the line impedance equal to the workspace Z₀.
- **No frequency or component values.** Elements are reactances and
  susceptances (normalised, or in ohms via `Z(…)`) at a single frequency;
  there are no henry or farad values and no frequency sweeps. There is no
  siemens type.
- **Curves are not inputs.** `series`, `shunt` and `line` accept points only,
  and curves cannot be used in arithmetic.
- **Mixed-frame intersections** between curves of z/y numbers and asymmetric Γ
  curves (for example `radial(gammaL)` with `rCircle(1)`) are reported as
  mode-dependent rather than computed.
- **General parametric curves** are sampled and intersected numerically, and
  tangencies between them may be missed.
- **Sliders are real-valued.** Use two sliders for a complex value, for
  example `zL = r + j*x`.
- **Some UI constructions are not expressions.** Transmission lines added to
  manually placed points, and radial guides added from the inspector, cannot
  be referenced in expressions, and a line's input point cannot take another
  line from the UI. Use `line()` and `radial()` in expressions instead.
- **Desktop first.** Touch supports tapping, dragging and one-finger panning,
  but not two-finger pinch zoom. The toolbar wraps below about 1000 px, labels
  become small on very small charts, and the grid does not adapt its density
  to the zoom level.

## Contributing and security

Bug reports and suggestions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
To report a security issue, follow [SECURITY.md](SECURITY.md) rather than
opening a public issue.

## License

SmithLab is licensed under the [Apache License 2.0](LICENSE).
Copyright 2026 Dakshesh Nankani.

The Smith Chart is named after its inventor, Phillip H. Smith. SmithLab is an
independent project and is not affiliated with Desmos or any other product
mentioned here.
