# Examples

Each example below can be pasted into the expression panel, one line per row.
The same sets are available in the app under **? Reference → Examples**,
where **Add all** inserts a whole set and attaches the sliders listed here.
The names in different sets are distinct, so several sets can be used
together.

The sliders listed under each block are attached automatically when a set is
inserted from the reference. When pasting by hand, attach them with the ⇿
button.

## Load through a transmission line

Move the slider: z_in travels around the VSWR circle.

```
zL = 0.5 + j1.2
l = 0.125
zIn = line(zL, l)
vswrL = vswr(zL)
```

Sliders: `l` from 0 … 0.5, step 0.001.

## Quarter-wave transformer

λ/4 of line turns z into 1/z, so `check` is 1.

```
zA = 2 + j0.5
zQ = line(zA, 0.25)
check = zQ * zA
```

## One load, four views

The same load as z, y, Γ and Z. In impedance mode y sits opposite z (its
number on the Z grid); switch the coordinates to Y to flip.

```
zB = 1 + j1
yB = 1/zB
gammaB = gamma(zB)
ZB = Z(zB)
```

## Matching candidates

Where the load's VSWR circle meets r = 1.

```
zC = 0.6 + j0.8
vswrC = vswrCircle(zC)
rUnit = rCircle(1)
pA = intersect(vswrC, rUnit, 1)
pB = intersect(vswrC, rUnit, 2)
```

## Line path and radial guide

The arc a line traces, and the angle of the load.

```
zD = 0.3 - j0.6
lD = 0.2
pathD = linePath(zD, lD)
guideD = radial(zD)
```

Sliders: `lD` from 0 … 0.5, step 0.001.

## L-network with sliders

Shunt b then series x: b = 0.5, x = 1 matches z = 2 to 1 + j0. The two
element sweeps show the circles each element moves along.

```
zM = 2
bM = 0.5
xM = 1
zM1 = shunt(zM, j*bM)
zM2 = series(zM1, j*xM)
shuntM = shuntPath(zM, -j2, j2)
sweepM = seriesPath(zM1, -j2, j2)
```

Sliders: `bM` from −2 … 2, step 0.01; `xM` from −2 … 2, step 0.01.

## Elements in ohms

Physical impedances stay in Ω, and elements in Ω use `Z(…)`. Try changing
Z₀. The last line is a short-circuited stub 0.1λ long, as a shunt element.

```
ZE = 100 + j50
ZE1 = series(ZE, Z(-j50))
ZE2 = shunt(ZE1, Z(j200))
stubE = shunt(z(0.4 - j0.3), y(line(z(0), 0.1)))
```

## Parametric curve

Any curve Γ(t), here a decaying spiral.

```
spiral = curve(gamma(0.9*exp(-0.6*t)*exp(j*4*pi*t)), t, 0, 2)
```

## Starter workspaces

The expression panel's **Insert point example** and **Insert curve example**
links add these. They reuse the names `zL` and `l`, so insert them into an
empty workspace.

Point example (the `gammaL` row is hidden from the chart):

```
zL = 0.5 + j1.2
yL = 1/zL
gammaL = (zL - 1)/(zL + 1)
l = 0.125
gammaIn = gammaL * exp(-j*4*pi*l)
```

Sliders: `l` from 0 … 0.5, step 0.001.

Curve example:

```
zL = 0.6 + j0.8
vswrL = vswrCircle(zL)
rUnit = rCircle(1)
pMatch = intersect(vswrL, rUnit, 1)
l = 0.1
path = linePath(zL, l)
spiral = curve(gamma(0.9*exp(-0.6*t)*exp(j*4*pi*t)), t, 0, 2)
```

Sliders: `l` from 0 … 0.5, step 0.001.

## More ideas

These combine the functions above; they are not built into the app.

**Single-stub match.** A load, a line to the g = 1 circle, then a shunt stub:

```
zS = 0.4 + j0.6
pathS = linePath(zS, 0.5)
dS = 0.1
zS1 = line(zS, dS)
stubS = y(line(z(0), 0.1))
zS2 = shunt(zS1, stubS)
```

Sliders: `dS` from 0 … 0.5.

Move `dS` until `zS1` sits on the g = 1 circle (switch the coordinates to Y
to read it), then edit the stub length (0.1) to cancel the remaining susceptance.

**Sweeping a component value.** `seriesPath` with a cross-domain element
sweeps a series capacitor given by its susceptance:

```
zK = 0.5 + j1
capK = seriesPath(zK, y(j0.5), y(j4))
```

The parameter is the susceptance b of the element (0.5 to 4), and the series
impedance added is 1/(jb).
