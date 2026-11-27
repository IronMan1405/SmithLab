# Mathematics

This page describes the mathematics SmithLab implements and the numerical
conventions it follows. Formulas are written with z, y for normalised
impedance and admittance, Z for impedance in ohms, and Γ = u + jv for the
reflection coefficient.

## Normalisation

```
z = Z / Z₀            y = 1 / z = Y · Z₀
```

`Z₀` must be a finite, strictly positive real number (a lossless reference).
Complex reference impedances are rejected with a `RangeError`, because they
need the power-wave definition of Γ.

## Reflection coefficient

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
fall outside the disc. They are returned as they are rather than clamped, and
`isPassiveReflection()` identifies them.

## VSWR and return loss

```
VSWR = (1 + |Γ|) / (1 − |Γ|)          RL = −20 log₁₀ |Γ|  dB
```

- VSWR = 1 at a match and +∞ for |Γ| = 1 (open, short, pure reactance).
- For |Γ| > 1, VSWR throws a `RangeError`, because the formula has no physical
  meaning there.
- RL = +∞ dB at Γ = 0 and 0 dB at |Γ| = 1. It is **negative** for |Γ| > 1
  (reflection gain), and is reported rather than hidden.

## Lossless transmission line

```
Γ_in = Γ_L · e^(−j2βl) = Γ_L · e^(−j4πd),    β = 2π/λ,  d = l/λ
λ = v_f · c / f
```

- `d` is the electrical length in wavelengths, measured from the load
  **toward the generator**.
- Positive d rotates Γ **clockwise**. Negative d rotates counter-clockwise,
  which is the reverse transformation (`loadReflectionFromInput`).
- |Γ| and VSWR are preserved, and the transformation is periodic with period
  λ/2.
- The rotation phasor is exact at multiples of λ/8, so λ/8, λ/4 and λ/2 give
  exactly −90°, −180° and 360°.
- The line's characteristic impedance is the workspace Z₀. A line with a
  different Z₀ would need a reference-impedance change, which is not modelled.
- The tests check agreement with the closed form
  z_in = (z_L + j tan βl)/(1 + j z_L tan βl), the quarter-wave transformer
  (z_in = 1/z_L at λ/4), and short ↔ open over λ/4.

## Series and shunt elements

```
series(x, e):  z_out = z(x) + e          shunt(x, e):  y_out = y(x) + e
```

The operation works in its own domain (impedance for series, admittance for
shunt) and converts the result back to the type of `x`. How the element `e`
is interpreted is described in the [expression guide](expressions.md#series-and-shunt-elements).

Sign conventions:

- series: +jx is inductive, −jx capacitive;
- shunt: +jb is capacitive, −jb inductive.

### Exact element sweeps

`seriesPath` and `shuntPath` draw the locus of `series(x, e)` or
`shunt(x, e)` as `e` moves along a straight segment of its own values. Let
w be the point's number in the operation's domain (z for series, y for shunt)
and t the swept parameter. Then

```
native element (plain, same domain, Ω in series):   u(t) = w + (α + βt)
cross-domain element (y in series; z or Ω in shunt): u(t) = w + 1/(α + βt)
```

and the curve's position is κ(t) = σ · C_Z(u(t)), with C_Z(u) = (u − 1)/(u + 1)
and σ = ±1 depending on whether the point's own frame number is u or 1/u.
Both forms make κ a Möbius map of t:

```
M(t) = (a·t + b) / (c·t + d)
```

The image of the real line under a Möbius map is a generalised circle.
With `den = c·d̄ − c̄·d`:

- `den = 0` gives a straight line;
- otherwise a circle with centre `(a·d̄ − b·c̄)/den` and radius `|a·d − b·c| / |den|`.

So every sweep is drawn as an exact arc (or segment) computed in closed form,
not fitted to samples. Series sweeps pass through Γ = +1 and shunt sweeps
through Γ = −1; increasing x or b moves clockwise.

**Passive clipping.** |κ| ≤ 1 exactly when Re u ≥ 0, because Re(1/u) has the
same sign as Re u. That condition is solved exactly in t:

- native elements: Re u is linear in t, giving at most one cut point;
- cross-domain elements: Re u ≥ 0 ⇔ Re(w)·|q|² + Re q ≥ 0 with q = α + βt,
  a quadratic, which can leave two disjoint passive intervals.

Each passive interval is drawn as its own exact arc. The pole of κ (u = −1)
has Re u = −1, so it never lies in a passive interval and no drawn arc passes
through infinity. Arcs whose radius exceeds 10⁶ are drawn as their chord, and
a very short sweep is kept as a short arc rather than becoming a full circle.

## Chart geometry

With Γ = u + jv:

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
Γ = 1 readable. The grid is declared in `geometry/grid.ts` (`GridSpec`) and
can be replaced without touching the renderer. The admittance grid uses the
same specification, rotated by 180°: g = 0.2 sits exactly on r = 5, and
b = 0.5 exactly on x = −2.

## Chart coordinate modes

The **Coords Z | Y** switch chooses which grid *numbers* are placed on. It is
independent of which grids are visible, and it never changes expression
values (`geometry/chart-mode.ts`):

```
impedance mode   number w is drawn at C_Z(w) = (w − 1)/(w + 1)
admittance mode  number w is drawn at C_Y(w) = (1 − w)/(1 + w) = −C_Z(w)
```

Every chart object belongs to one of two frames:

| Frame | What belongs to it | Where it is drawn |
|---|---|---|
| **number** | z, y and Z (as Z/Z₀) values, and curves made of them (`rCircle`, `xCircle`, `gCircle`, `bCircle`, element sweeps, and `linePath`, `radial` or `curve()` of a z/y/Z value) | Stored canonically at C_Z(w); flipped exactly (rotation by π) in admittance mode |
| **plane** | Γ values, manual points, line-input points, line arcs, wavelength scales, Γ curves | At the physical Γ in both modes |

In practice:

- In impedance mode, `yL = 1/zL` sits opposite `zL`. In admittance mode,
  `yL` sits on its admittance-grid coordinates and `zL` is opposite.
- `gamma(zL)` never moves.
- `gCircle(1)` coincides with `rCircle(1)` in impedance mode, and with the
  drawn g = 1 circle in admittance mode.
- Readouts always describe the physical load a value represents.

**Intersections across frames.** `intersect()` and `at()` return a value of
the curves' own kind:

- number ∩ number: computed as numbers, so the result is the same in every mode;
- plane ∩ plane: a Γ point;
- number ∩ a plane circle centred on Γ = 0 (`vswrCircle`): allowed, because
  it is unchanged by the flip;
- number ∩ any other plane curve: an error, because the answer would depend on
  the mode.

**Rotation.** `rotate(c, θ)` maps Γ(t) to Γ(t)·e^(jθ). It is exact for
circles, arcs and segments: centres, endpoints and start angles rotate, while
radius, sweep, direction of travel and parameter are unchanged. A half-turn is
exactly −1, and the same primitive performs the admittance-mode flip.

## Wavelength scales

Both scales read 0 at the short-circuit point (Γ = −1, the left edge) and
cover λ/2 per revolution.

- **Wavelengths toward generator** (WTG) increases clockwise:
  0 → 0.125 (top) → 0.25 (right) → 0.375 (bottom), with
  WTG = ((π − ∠Γ)/4π) mod ½. Adding a line of length d advances the WTG
  reading by exactly d, matching e^(−j4πd).
- **Wavelengths toward load** (WTL) is (½ − WTG) mod ½ and increases
  counter-clockwise.

The scales are drawn as three concentric rings, as on the classic printed
chart:

| Radius (in units of the chart radius) | Element |
|---|---|
| 1.09 | inner ring, closing the toward-load strip |
| 1.09–1.17 | toward-load strip: WTL numbers and the "toward load" title |
| 1.17 | shared tick ring; ticks straddle it, since both scales read the same angle |
| 1.17–1.25 | toward-generator strip: WTG numbers and the "toward generator" title |
| 1.25 | outer ring, closing the toward-generator strip |

Radial guide readings use the same conventions and the *displayed* angle, so
a guide on a y value reads λ/4 differently in the two coordinate modes, while
a guide on a manual point reads the same.

## Numerical conventions

The full rationale is in the header comment of `src/core/complex.ts`.

1. **Representation.** Complex numbers are immutable `{ re, im }` records.
   Every function is pure.
2. **Extended complex plane.** There is a single point at infinity,
   `COMPLEX_INFINITY`. Any value with an infinite component counts as ∞; test
   for it with `isInfinite()`.
   - `a/0 = ∞` (a ≠ 0) and `a/∞ = 0`.
   - `1/0 = ∞` and `1/∞ = 0`, so short ↔ y = ∞ and open ↔ y = 0.
   - The limits are exact: `Γ(∞) = 1` and `z(Γ = ∞) = −1`.
3. **Indeterminate forms.** `0/0`, `∞/∞`, `∞·0` and `∞ ± ∞` give NaN. Domain
   functions call `assertComplex()` and **throw** on NaN input rather than
   passing it on.
4. **Overflow.** Finite operands that overflow give ∞, not NaN. Division uses
   Smith's algorithm to avoid intermediate overflow.
5. **Boundary tolerance.** |Γ| is treated as on the unit circle within
   `BOUNDARY_TOLERANCE = 1e-12`. This absorbs round-off for pure reactances,
   so VSWR = ∞ rather than throwing.
6. **Argument.** `arg(0) = 0`, including signed zeros. `arg(∞)` is NaN.
7. **Invalid domain input throws `RangeError`.** This covers Z₀ ≤ 0, r < 0,
   VSWR < 1, |Γ| < 0, and |Γ| > 1 for VSWR.

**Precision near Γ = +1.** Computing `z = (1 + Γ)/(1 − Γ)` close to the
open-circuit point loses relative precision to cancellation in `1 − Γ`. This
is inherent to the representation. Values stay finite and are correct to
about `ε/|1 − Γ|`.

## Coordinate systems

Full documentation is in `src/geometry/coordinates.ts`.

1. **Γ-plane.** The mathematical space; all geometry lives here. +v points up.
2. **SVG user space.** A fixed viewBox with the unit circle at radius
   `CHART_RADIUS = 1000` and a margin of `CHART_MARGIN = 380` units for
   boundary labels, the wavelength scales and their titles:
   `x = u·R`, `y = −v·R` (y is negated because SVG's y axis points down).
3. **Screen.** The browser maps user space to the screen with
   `preserveAspectRatio="xMidYMid meet"`, a uniform scale, so the chart is
   never distorted. `chart/viewport.ts` reproduces that mapping as pure
   functions (`screenToSvg`, `svgToScreen`, `screenToGamma`, `gammaToScreen`),
   taking the element's bounding rectangle as the only DOM input.

**Pan and zoom.** The view is `{ center: Γ, zoom }`. The viewBox derived from
it is always square, so the chart stays circular at every zoom level and
window size. Zoom anchors at the cursor and is limited to 0.8×–500×; the
centre is kept within ±1.25 so the chart cannot be lost off-screen. Point
markers, labels and line weights keep a constant on-screen size, using
`vector-effect: non-scaling-stroke` for strokes.

## Curve sampling and intersections

Curves with exact geometry render as true SVG arcs and are intersected
analytically. Generic curves (`curve(expr, t, t0, t1)`) are sampled
adaptively by `geometry/curve-sampling.ts`, starting from 64 intervals. An
interval is bisected while any of these holds:

- the midpoint is further from the chord than the tolerance (0.35 screen
  pixels, converted to Γ units);
- the chord is longer than 0.05;
- the midpoint collapses onto one end, which is how a jump looks;
- the curve crosses the unit circle.

Undefined points break the polyline, and so does an interval that is still
long at the maximum depth (a jump). Separate pieces are never joined.
Crossings of the unit circle are located by bisection and projected onto the
circle. Samples are cached per curve object and per power-of-two tolerance,
so panning reuses samples and a curve that was not re-evaluated is never
resampled.

Intersections (`geometry/intersections.ts`):

- **Exact curves** use analytic circle–circle, circle–line and line–line
  intersections, restricted to each arc's range. A tangency (the curves touch
  within 1e-9) is reported as one point marked "tangent"; identical curves are
  reported as coincident; when curves do not meet, the closest approach is
  reported.
- **Generic curves** use numerical methods and their results are marked
  "numerical". Against an exact curve, sign changes of its implicit equation
  along an adaptive sampling are refined by bisection. Between two generic
  curves, crossings of the sampled polylines are refined by Newton's method on
  Γ₁(t) − Γ₂(s) = 0.
- Results are deduplicated within 1e-7, kept only inside |Γ| ≤ 1, and
  ordered by increasing Re Γ (upper point first when Re is equal). Γ = 1, the
  point at infinity, therefore always comes last.
