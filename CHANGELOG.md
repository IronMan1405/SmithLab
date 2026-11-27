# Changelog

All notable changes to SmithLab are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before 1.0, minor
versions may change the expression language in incompatible ways.

## [0.9.0] - Unreleased

First public release (beta).

### Added

- **Chart.** A Smith Chart generated from its equations and drawn in SVG:
  impedance and admittance grids with labels, impedance/admittance coordinate
  modes, wavelength scales toward generator and load, pan and zoom, and light
  and dark themes.
- **Direct manipulation.** Points placed and dragged on the chart, with
  snapping to match, short and open, keyboard control, and an inspector
  showing z, Z, Γ, |Γ|, ∠Γ, VSWR, return loss and y. Adjustable Z₀.
- **Transmission lines.** Lossless lines on manually placed points, with a
  live input point, length controls and the constant-VSWR path.
- **Expression language.** Complex arithmetic, typed RF values (z, y, Γ, Z in
  Ω, lengths in λ) with operator type rules and a naming convention, named
  dependencies with incremental re-evaluation and cycle detection, sliders,
  and dragging of literal expression points.
- **RF functions.** `z`, `y`, `gamma`, `Z`, `len`, `vswr`, `rl`, `line`,
  `series` and `shunt`.
- **Curves.** `vswrCircle`, `rCircle`, `xCircle`, `gCircle`, `bCircle`,
  `linePath`, `radial`, exact `rotate`, exact element sweeps `seriesPath` and
  `shuntPath`, and general parametric curves `curve(expr, t, t0, t1)`.
- **Curve queries.** `intersect()` and `at()`, analytic intersections for
  exact curves and numerical ones for parametric curves, and a curve inspector
  with a probe and an intersection list.
- **Radial guides** with wavelength readings outside the scales.
- **Built-in expression reference**, generated from the function registry,
  with runnable examples and example sets.
- **Documentation**: user guide, expression reference, examples, mathematics
  and architecture.
- Apache License 2.0.

[0.9.0]: https://github.com/IronMan1405/SmithLab/releases/tag/v0.9.0
