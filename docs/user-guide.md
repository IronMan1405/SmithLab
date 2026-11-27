# User guide

SmithLab has three panels: the **expression panel** on the left, the
**chart** in the middle and the **inspector** on the right. Points and curves
can be created directly on the chart, or written as expressions and linked to
each other.

## The toolbar

| Control | What it does |
|---|---|
| Impedance grid / Admittance grid | Show or hide the r/x and g/b grids. Both can be shown at once. |
| Expressions | Show or hide everything defined in the expression panel. |
| λ scales | Show or hide the wavelength scales around the chart. |
| Coords Z \| Y | Choose whether z/y numbers are placed on impedance or admittance coordinates (see [coordinate modes](#coordinate-modes)). |
| Z₀ | The workspace reference impedance in ohms. |
| Light / Dark / System | Colour theme. The choice is remembered by the browser. |

## Working on the chart

| Action | Result |
|--------|--------|
| Click inside the chart | Create a point at that Γ and select it |
| Click outside the chart | Deselect |
| Press and drag a point | Select and move it; values update live |
| Drag the background (or middle-drag anywhere) | Pan |
| Scroll, or pinch on a trackpad | Zoom at the cursor |
| − / + / Fit buttons, or `−` `+` `0` | Zoom out / in / reset the view |
| Arrow keys (Shift for ×10) | Nudge the selected point |
| Delete / Backspace | Delete the selected point |
| Esc | Deselect |
| Tab | Focus (and select) points in turn |
| Hold Alt while placing or dragging | Disable snapping |

Interaction rules:

- **Thresholds.** A press only becomes a drag or pan after moving more than
  4 px, so a click on a point never nudges it and a pan never creates a point.
- **Priority.** A hit on a point always wins over the background. The selected
  point is drawn last, so it is on top for hit-testing. Hit areas are larger
  than the visible marker.
- **Grab offset.** Dragging keeps the offset between the cursor and the point,
  so the point does not jump when picked up.
- **Clamping.** Manually placed points are kept within |Γ| ≤ 1. Dragging past
  the edge slides the point along the boundary, giving a lossless load.
- **Snapping.** Near Γ = 0, −1 or +1, a point snaps to an exact matched load,
  short or open circuit, so those cases are reachable by hand.
- **Text fields.** Keyboard shortcuts are inactive while typing, so Backspace
  in a text field never deletes a point.
- Hovering the chart shows Γ, z and y at the pointer.

## The point inspector

For the selected point the inspector shows z, Z (at the current Z₀), Γ, |Γ|,
∠Γ, VSWR, return loss and y, with a badge for matched, short, open or
lossless loads. A manually placed point can be renamed inline. Special cases:

- **Matched (Γ = 0):** VSWR 1, return loss ∞ dB, phase shown as undefined.
- **Short:** z = 0, y = ∞.
- **Open:** z = Z = ∞, y = 0.
- **On the boundary:** r and g are shown as exactly 0, removing round-off.

## Transmission lines

1. Select a manually placed point (the load) and choose **+ Add transmission
   line**. A dependent input point (◆) is created at 0.125λ and selected.
2. Change its length in any of these ways:
   - **Numeric field:** any finite length, including more than λ/2, or a
     negative length for toward the load.
   - **Slider:** covers 0 to λ/2 in steps of 0.001λ. For lengths outside that
     range it shows the equivalent position within the period and keeps the
     whole half-wavelengths already entered.
   - **Arrow keys:** ±0.001λ, or Shift for ±0.01λ.
   - **Dragging the ◆:** it slides along its constant-|Γ| circle and never
     leaves it; the length stays continuous past λ/2.
   - **0λ** resets the length.
3. On the chart, the dashed circle is the full constant-VSWR path, and the
   solid arc with an arrowhead is the rotation actually applied, from load to
   input.
4. The inspector shows the input values (z_in, Z_in, Γ_in, |Γ_in|, ∠Γ_in,
   VSWR, return loss, y_in, length and the WTG reading), and below them the
   load's z_L, Z_L, Γ_L, |Γ_L| and WTG for comparison.
5. Moving the load moves the input point with it. **Remove line** deletes only
   the input point. Deleting the load also removes its lines.

For a point defined by an expression, **+ Add transmission line** inserts two
rows right after its definition instead, for example:

```
l_zL = 0.125            ← with a 0–0.5λ slider
zL_in = line(zL, l_zL)
```

The result keeps the source's name prefix and is itself a point that can take
another line or a guide. The source expression is not modified.

## Radial guides

A radial guide is the straight line from the chart centre through a point to
the unit circle: the ray of constant ∠Γ.

- Any point (manual, line input or expression) has **+ Radial guide**. The
  guide follows the point through drags, line-length changes and expression
  edits, and is deleted together with it.
- Guides are drawn dashed, extended past the unit circle to the outer
  wavelength ring as a visual aid. Their readings are written just outside the
  outer ring: the selected guide shows `WTG ↻ .325λ / WTL ↺ .175λ`, others a
  compact `↻ .325λ`. Guides closer than 8° stack outward.
- Guides can be selected on the chart, inspected (∠Γ, |Γ| at the source, WTG
  and WTL), hidden and deleted.
- In expressions, the same geometry is available as `radial(x)`.

## The expression panel

- **+ Add** creates an empty row. Enter inside a row adds a new row below it.
- Each row shows its result or error underneath, with a chip for its type.
- Row controls:
  - the square or dot in the gutter shows or hides a plottable result;
  - the checkbox enables or disables the row;
  - ⇿ attaches a slider (only for `name = number`);
  - × deletes the row.
- Focusing a row selects what it plots, and clicking a plotted expression point
  selects its row. The inspector then shows the value together with the
  expression that defines it.
- **Insert point example** and **Insert curve example** add small starter
  workspaces. **? Reference** opens the built-in reference with more examples.

The language itself is described in [Expressions](expressions.md).

## Curves and the curve inspector

Selecting a curve, on the chart or by focusing its row, opens the curve
inspector. It shows:

- the defining expression and its properties;
- a colour picker with six theme-aware colours;
- a probe slider along the curve's parameter, with a marker and its Γ, z and y;
- the curve's intersections with every other visible curve. Each one can be
  highlighted on the chart and turned into a point expression
  `pN = intersect(c1, c2, k)`.

Pressing a curve only selects it; dragging from a curve pans.

## Coordinate modes

**Coords Z | Y** chooses which grid numbers are placed on. In impedance mode a
z value sits on its r/x coordinates and the matching y value sits opposite it.
In admittance mode a y value sits on its g/b coordinates. Γ values and
manually placed points never move, and expression values never change. While
a point is selected, the chart draws the active grid's circles through it
(r and x, or g and b). See [Mathematics](mathematics.md#chart-coordinate-modes)
for the precise rules.

## Characteristic impedance

The Z₀ field applies valid positive values immediately. Invalid entries are
flagged and revert when the field loses focus.

- Manually placed points are stored by Γ, so **changing Z₀ keeps them where
  they are**: their normalised z is unchanged and their Z = z·Z₀ is
  re-derived.
- Expressions in ohms (for example `ZL = 30 + j40`) keep their ohm values, so
  their points move when Z₀ changes, and everything that depends on them is
  recomputed.

## Saving work

The workspace is not saved. Reloading the page clears points and
expressions. Copy expression text somewhere else to keep it.
