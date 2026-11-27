# Expressions

The expression panel is the centre of SmithLab. Each row defines a value, a
point or a curve, and rows can refer to each other by name. Changing one row,
moving a slider or dragging a point re-evaluates everything that depends on
it.

```
zL = 0.5 + j1.2                     ← a load (drag it on the chart)
l = 0.125                           ← attach a slider
zIn = line(zL, l)                   ← the load seen through l wavelengths
vswrL = vswrCircle(zL)              ← a curve
pA = intersect(vswrL, rCircle(1))   ← a point that follows zL
```

The in-app **? Reference** lists every function with a runnable example. This
page is the written reference. For the formulas behind each function, see
[Mathematics](mathematics.md).

## Syntax

| Form | Example |
|------|---------|
| Assignment or bare expression | `zL = 0.5 + j1.2`, `vswr(zL)` |
| Numbers | `2`, `0.5`, `.5`, `1e-3` |
| Imaginary literals | `j1.2`, `1.2j`; `j` alone is the imaginary unit |
| Operators | `+ - * / ^` (`^` is right-associative), unary `-`, parentheses |
| Constants | `pi` (or `π`), `j` |
| Function calls | `name(arg, …)` |

- There is no implicit multiplication: write `2*pi`, not `2pi`.
- Names consist of letters (Greek included), digits and `_`. A name cannot be
  `j` followed by digits, because that is an imaginary literal.
- Unicode `−`, `×`, `·` and `÷` are accepted, so displayed results can be
  pasted back in.
- Parsing uses a hand-written recursive-descent parser. Nothing is passed to
  `eval` or `Function`.

## Types

Every value has a type that says what the number means. Types stop
physically meaningless operations, such as adding an impedance to an
admittance.

| Type | Meaning | Chip |
|------|---------|------|
| `real` | plain real number | ℝ |
| `complex` | plain complex number | ℂ |
| `impedance` | normalised impedance z = Z/Z₀ | z |
| `admittance` | normalised admittance y = Y·Z₀ | y |
| `reflection` | reflection coefficient Γ | Γ |
| `physicalImpedance` | impedance Z in ohms | Ω |
| `length` | electrical length in wavelengths | λ |
| curve | a curve on the chart | ∿ |

A value gets its type in one of three ways.

**1. Conversion functions.** `z(x)`, `y(x)`, `gamma(x)` and `Z(x)` convert
between chart types: `gamma(zL)` computes Γ from z, `z(ZL)` normalises with
the workspace Z₀, and `y(zL)` = 1/z. Applied to a plain number they *declare*
it, so `z(1 + j)` is an impedance. `len(x)` declares a real number as a
length.

**2. Operator rules.**

| Expression | Result | Why |
|---|---|---|
| `zA + zB`, `zA - 1` | impedance | series combination; plain numbers act in the z-plane |
| `1/zA` | admittance | the reciprocal of z is y (and `1/yA` is z) |
| `zA/zB` | complex | a ratio has no RF type |
| `gammaA * exp(-j*pi/2)` | reflection | rotating Γ keeps it a Γ |
| `gammaA + 0.1` | complex | a shifted Γ is no longer a reflection coefficient |
| `lA + 0.05` | length | adding lengths |
| `lA * 2`, `-4*pi*lA` | plain number | a multiple of a length is a plain number (an angle or a phase) |

These combinations are errors:

- adding an impedance and an admittance;
- adding a plain number to an Ω quantity (use `Z(…)` or `z(…)`);
- adding a complex number to a length;
- a typed value inside a maths function such as `exp()`;
- a typed exponent.

**3. The naming convention.** When a *plain* value is assigned to a name with
one of these prefixes, the name declares its type:

| Prefix | Type | Matches | Does not match |
|---|---|---|---|
| `z` | impedance | `z`, `zL`, `z1`, `z_in` | `zeta`, `zin` |
| `y` | admittance | `y`, `yL`, `y2` | `yes` |
| `Z` | physical impedance (Ω) | `Z`, `ZL`, `Z_load` | `Zeta` |
| `gamma` or `Γ` | reflection coefficient | `gammaL`, `gamma_in`, `Γ`, `Γin` | `gammas` |
| `l` | length | `l`, `l1`, `lStub`, `l_zL` | `loss`, `k` |

- The prefix must be followed by the end of the name, an uppercase letter, a
  digit or `_`.
- A name that contradicts an already-typed value is an error that suggests the
  right conversion. For example, `gammaX = zL` says to use `gamma(…)`.
- A curve must not be given a typed name: `vswrL` and `c1` are fine, `zC` is
  not.
- The convention exists so that textbook forms work exactly as written.

## Functions

### Mathematics

`exp ln sqrt sin cos tan deg rad` take plain numbers and work in the complex
plane (principal branches, radians). `re im abs arg` accept any value and
return a real number. `conj(x)` keeps the type of `x`. `polar(r, θ)` returns
r·e^(jθ).

### RF conversions and measurements

| Function | Result |
|---|---|
| `z(x)`, `y(x)`, `gamma(x)`, `Z(x)` | convert x to that type, or declare a plain number |
| `len(x)` | declare a real number as a length in λ |
| `vswr(x)` | VSWR of an impedance, admittance or Γ |
| `rl(x)` | return loss in dB |
| `line(x, l)` | x seen through a lossless line of l wavelengths toward the generator; keeps the type of x |

### Series and shunt elements

```
series(x, e)    z_out = z(x) + e      shunt(x, e)    y_out = y(x) + e
```

**The point `x`** is any value with a chart position: z, y, Γ or Z in Ω. The
result has **the same type as `x`**, as with `line()`, so chains need no
`1/z` steps: `z2 = shunt(line(zL, 0.125), j0.5)` stays an impedance. A plain
number, a length or a curve as `x` is rejected.

**The element `e`** is interpreted by its type:

| Element type | in `series` | in `shunt` |
|---|---|---|
| plain number | normalised impedance (`j0.5` inductor, `0.2` resistor) | normalised admittance (`j0.5` capacitor) |
| z | used as is | 1/z |
| y | 1/y | used as is |
| Z (Ω) | Z/Z₀ | Z₀/Z |
| Γ, λ, curve | error | error |

- **Ambiguity rule:** if `x` is in ohms, a plain-number element is rejected as
  ambiguous, and the error suggests `Z(…)` (ohms) or `z(…)` (normalised). This
  matches the rule that `ZL + j10` is an error.
- **Sign conventions:** series +jx is inductive and −jx capacitive; shunt +jb
  is capacitive and −jb inductive.
- Ω points and Ω elements depend on Z₀, so changing Z₀ recomputes exactly
  those expressions.
- Stubs are compositions rather than functions, for example
  `shunt(x, y(line(z(0), lS)))` for a short-circuited stub of length `lS`.

## Curves

A curve is the result of one of these constructions. Each curve has a named
parameter, which `at(c, t)` and the curve inspector use.

| Expression | Curve | Parameter |
|---|---|---|
| `vswrCircle(s)` or `vswrCircle(x)` | constant-\|Γ\| circle, for a VSWR `s ≥ 1` or through a z/y/Γ/Z point | WTG, 0–0.5λ |
| `rCircle(r)` or `rCircle(z)` | constant-resistance circle (`z` uses Re z) | x |
| `xCircle(x)` or `xCircle(z)` | constant-reactance arc (x = 0 is the real axis) | r |
| `gCircle(g)` or `gCircle(y)` | constant-conductance circle | b |
| `bCircle(b)` or `bCircle(y)` | constant-susceptance arc | g |
| `linePath(x, l)` or `linePath(x, l0, l1)` | Γ(l) = Γ_L·e^(−j4πl), clockwise toward the generator | l |
| `radial(x)` | radial guide from the centre through a point to the boundary | \|Γ\|, 0–1 |
| `rotate(c, θ)` | curve `c` rotated about Γ = 0 by θ radians (exact) | same as `c` |
| `seriesPath(x, e1)` or `seriesPath(x, e0, e1)` | exact locus of `series(x, e)` as `e` sweeps e0 → e1 | see below |
| `shuntPath(x, e1)` or `shuntPath(x, e0, e1)` | exact locus of `shunt(x, e)` as `e` sweeps e0 → e1 | see below |
| `curve(expr, t, t0, t1)` | any parametric curve Γ(t) | t |

Two queries turn curves back into points:

- `intersect(c1, c2)` or `intersect(c1, c2, k)` gives the k-th intersection
  (k defaults to 1). Intersections are ordered by increasing Re Γ.
- `at(c, t)` gives the point of curve `c` at parameter `t`.

Both return a z or y point for curves made of impedance or admittance
numbers, and a Γ point for Γ curves. See
[chart coordinate modes](mathematics.md#chart-coordinate-modes) for the rules
when the two kinds are mixed.

Curves cannot be used in arithmetic, and `series`, `shunt` and `line` accept
points only.

Along a line of l wavelengths toward the generator, rotate a curve with
`rotate(c, -4*pi*l)`. A bare length is rejected with that hint.

### Element sweeps: `seriesPath` and `shuntPath`

`seriesPath(x, e0, e1)` draws every value of `series(x, e)` as the element
`e` moves along the straight segment from `e0` to `e1`; `shuntPath` does the
same for `shunt`. The result is computed exactly (see
[exact element sweeps](mathematics.md#exact-element-sweeps)), so its
intersections are analytic.

```
zM = 2
shuntM = shuntPath(zM, -j2, j2)       ← follows the g = 0.5 circle
zM1 = shunt(zM, j0.5)
sweepM = seriesPath(zM1, -j2, j2)     ← follows the r = 1 circle through the match
```

- **Element types.** `e0` and `e1` must have the same type (or both be plain
  numbers). The element rules are those of `series` and `shunt` above.
- **Two-argument form.** `seriesPath(x, e1)` starts from z = 0 and
  `shuntPath(x, e1)` from y = 0. This is only allowed when that zero can be
  written in `e1`'s type: a plain number or z (or Z) for series, a plain number
  or y for shunt. A cross-domain element, such as a y in series or a z or Z in
  shunt, needs an explicit `e0`, because the zero would be infinite.
- **Parameter.** The parameter is the element's **own** value. When `e0` and
  `e1` differ only in their imaginary part it is that part (x, b, or X in Ω);
  when they differ only in their real part it is that part (r, g, or R in Ω);
  otherwise it is s from 0 to 1 along the segment. For a cross-domain element
  the operation adds 1/e, so the parameter is **not** the impedance or
  admittance actually added. For example, in `seriesPath(zL, y(j0.5), y(j2))`
  the parameter is b from 0.5 to 2, and the series impedance added is 1/(jb).
- **Passive part only.** Only the part of the sweep with |Γ| ≤ 1 is drawn.
  `at(c, t)` rejects a parameter value outside that part, and names the valid
  range, instead of clamping it.
- **Errors.** A zero-width sweep (`e0 = e1`), a sweep that never reaches the
  passive chart, a series element on an open circuit and a shunt element on a
  short circuit (neither can move) are all errors.

### Generic curves: `curve(expr, t, t0, t1)`

- `curve` is a *special form*. Its body is not evaluated immediately: it
  becomes Γ(t), with `t` bound locally, so `t` shadows any global `t` and is
  not a dependency.
- The body must evaluate to z, y, Γ or Z.
- At construction the body is evaluated at a few probe values, so reference
  and type errors are reported straight away. Mathematical failures at
  individual parameter values (0/0, undefined functions) only mark singular
  points.
- Generic curves are sampled adaptively and intersected numerically. The
  built-in constructions carry exact geometry, so prefer them when one exists.

## Plotting

- Impedances, admittances, Γ and physical impedances are plotted as teal
  squares. Physical impedances use the workspace Z₀, so their points move when
  Z₀ changes.
- Plain complex numbers are not plotted. Their row suggests wrapping them in
  `z()`, `y()` or `gamma()`.
- Values outside the chart (|Γ| > 1) are reported in the row rather than drawn.
- Coincident points get stacked labels.
- Where a z or y value is drawn depends on the
  [coordinate mode](mathematics.md#chart-coordinate-modes). Γ values never move.

## Dependencies and evaluation

- Each `name = …` defines a name. A name defined twice is an error on both
  rows, and `pi`, `π` and `j` cannot be redefined.
- Cycles are detected and reported with their path (`a → b → a`). Undefined
  names, references to disabled rows, and dependencies that have errors are
  each reported on the dependent row. A bad row never stops the others from
  evaluating.
- Deleting an expression turns its dependents into "not defined" errors,
  which clear as soon as the name is defined again.
- Evaluation follows a deterministic topological order, independent of the
  order of the rows.
- Evaluation is incremental: an expression is re-evaluated only when its text,
  its enabled state, a name binding, a dependency's result or (for expressions
  that use Z₀) Z₀ has changed.

## Sliders

- A slider can be attached to a row of the form `name = number` with the ⇿
  button. Lengths default to 0–0.5 in steps of 0.001; other values get a range
  that contains them.
- Min, max and step are editable.
- Moving the slider *rewrites the number in the expression text*, so the text
  remains the only copy of the value.
- If the row is edited into something other than a number, the slider pauses
  until it is a plain number again.
- Sliders are real-valued. To drive a complex value, use two sliders, for
  example `zL = r + j*x`.

## Dragging expression points

- A point expression whose body is a *literal* can be dragged on the chart:
  `zL = 0.5 + j1.2`, `zL = -j0.3`, `zL = 2`, or a literal wrapped in `z()`,
  `y()`, `gamma()` or `Z()`.
- The drag converts the drop position back into the expression's own type,
  using the active coordinate mode's grid, and rewrites only that literal (4
  decimals for normalised values, 2 for Ω). Dependents update through normal
  re-evaluation.
- Arrow keys nudge a draggable expression point the same way.
- Computed points (`intersect(…)`, `1/zL`, …) are locked, and the inspector
  explains why.
- A drag that would need an infinite value (an impedance at Γ = 1) is ignored.

## The built-in reference

The **? Reference** button in the expression panel opens a reference covering
names and the naming convention, constants and complex literals, operators and
type rules, every function with a runnable example, types, plotting, sliders,
and practical example sets. Clicking an example adds it as a row; **Add all**
inserts a whole example set and is disabled when its names are already in use.
The same example sets are listed in [Examples](examples.md).
