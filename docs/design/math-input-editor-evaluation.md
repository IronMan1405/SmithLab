# Mathematical input editor: MathQuill vs MathLive

*Investigation for Milestone 3C.1. No library has been integrated.*

## Context

SmithLab expressions are plain text in a small, documented grammar (`src/expressions/parser.ts`), for example:

```
zL = 0.5 + j1.2
gammaIn = gammaL * exp(-j*4*pi*l)
spiral = curve(gamma(0.9*exp(-0.6*t)*exp(j*4*pi*t)), t, 0, 2)
```

The text is the single source of truth. It is stored in workspace state, it is what dependencies are built from, and sliders and point drags rewrite it. Any visual editor must therefore convert to and from this syntax **without changing meaning**, and the text syntax must remain supported.

## Facts gathered

The registry data comes from `npm view` on 2026-11-27.

| | MathQuill | MathLive |
|---|---|---|
| npm package / latest | `mathquill` 0.10.1-a (last published 2022-08) | `mathlive` 0.111.4 (updated 2026-10-31) |
| Maintained forks / wrappers | `@edtr-io/mathquill` 0.11.0 (2023-11); `react-mathquill` 1.0.4 (MIT wrapper, React 18/19 peer, 2025-08) | none needed (first-party web component `<math-field>`) |
| Licence | MPL-2.0 (file-level copyleft) | MIT |
| Runtime dependencies | jQuery 1.x (`^1.12.3`) | none |
| Package size (unpacked, all builds and fonts) | ~2.2 MB (edtr-io fork) | ~5.8 MB |
| Integration model | jQuery plugin; React via a wrapper | Custom element; usable directly from React 19 (needs a JSX type declaration) |
| Output | LaTeX | LaTeX; MathJSON via the separate Compute Engine (~28 MB unpacked, MIT) |
| Accessibility | Basic; ARIA and speech exist mainly in forks | Built in: ARIA, keyboard navigation, spoken math, virtual keyboard |

**Still to measure.** The *runtime* bundle cost (minified and gzipped, including fonts) has to be measured in the proof of concept below. Unpacked package sizes include several builds and overstate it. MathLive is still expected to be the heavier of the two by several hundred kB, so it would need to be loaded lazily.

## Evaluation against SmithLab's needs

**Maintenance and compatibility.**
- MathQuill's main package is effectively unmaintained and drags in jQuery 1.x. Its public forks are community-maintained.
- MathLive is actively released and dependency-free. It also works as a standard custom element, which fits React 19 without a wrapper.

**Licence.**
- Both are compatible with an open-source SmithLab release.
- MIT (MathLive) imposes nothing beyond attribution.
- MPL-2.0 (MathQuill) is file-level copyleft: modified MathQuill files must stay MPL. That is workable, but it is an extra obligation if we ever patch or fork it.

**Complex numbers and engineering notation.** Neither editor understands RF semantics. Both just emit LaTeX, so every one of these needs explicit handling in our converter:

| Issue | Details |
|---|---|
| `j` | An ordinary identifier to both editors. `j1.2` is a SmithLab *imaginary literal* but would render as the product *j·1.2*. |
| Implicit multiplication | Visual editors produce `2\pi` and `j4\pi l`, but SmithLab deliberately requires `*`. The converter must insert multiplication explicitly and unambiguously. |
| `e^{x}` | SmithLab has `exp(x)` and **no** constant `e`. The converter must map `e^{…}` → `exp(…)`, or the editor must be configured to emit `\exp`. |
| Names | `\Gamma`, `\pi` and subscripts (`z_{L}`, `\Gamma_{in}`) need a deterministic mapping to SmithLab identifiers (`zL`/`z_L`, `Γin`/`gammaIn`). This interacts with the type naming convention (`z…`, `y…`, `Z…`, `gamma…`/`Γ…`, `l…`). |
| Function names | `vswrCircle`, `linePath`, `curve(expr, t, t0, t1)` and similar need `\operatorname{…}`. The `curve` special form (a bound parameter) has no natural visual notation. |
| Engineering notation | Both editors can show `1.2\times10^{-3}`; that must map back to `1.2e-3`. |

**Loading existing expressions without losing meaning.**
- The direction that matters most is SmithLab text → AST → LaTeX. It is deterministic and easy to write from our existing AST (`src/expressions/ast.ts`).
- The reverse, LaTeX → SmithLab, is the risky direction, because editors accept far more notation than SmithLab supports. A safe design accepts only a documented LaTeX subset and reports anything else as an error, instead of guessing.
- Round-tripping can be *proved* by tests: for every expression in the test corpus, `parse(fromLatex(toLatex(ast)))` must equal `ast`.

**Accessibility.**
- MathLive is clearly stronger: screen-reader output, keyboard navigation, and a virtual keyboard that is useful on tablets.
- MathQuill would need fork-specific work.
- The current plain `<input>` is already accessible and copy/paste friendly, which a visual editor must not regress.

## Options

| Option | For | Against |
|---|---|---|
| **MathQuill** | Proven Desmos-style typing feel; smaller | Stagnant upstream, jQuery 1.x, MPL obligations, weaker accessibility |
| **MathLive** | Maintained, MIT, accessible, no dependencies, web component | Larger bundle (must be lazy-loaded); its rich input invites notation we must then reject |
| **Custom lightweight editor** | Exactly our grammar; tiny | Rich-text math editing (cursor movement, fractions, sub/superscripts) is a large, error-prone project |
| **Keep the current editor** | Zero cost; text is the source of truth and is copyable; no conversion risk | Less approachable for students used to typeset math |

## Recommendation

1. **Keep the current text editor as the primary editor for now.** The language is still evolving (curves, and next circuit elements), and every syntax change would otherwise also need converter changes.
2. **Next step, with no dependency:** add a *read-only typeset rendering* of each row from the AST (an AST → MathML or LaTeX printer). Students then see typeset math while the text stays canonical. This also produces the `toLatex` printer that any future editor needs.
3. **When a visual editor is justified, choose MathLive** (MIT, maintained, accessible, no dependencies). Load it lazily behind an optional "visual input" toggle per row, and keep text as the stored form.

MathQuill is not recommended, given its stalled upstream and jQuery dependency. A custom editor is not justified for the cost.

## Minimal proof of concept (MathLive)

The proof of concept should be scoped so that it can be thrown away:

1. **`src/expressions/latex.ts` (pure, no dependencies).** It provides:
   - `toLatex(node)`: explicit `\cdot`, `\operatorname{}` for SmithLab functions, `\Gamma`, `\pi`, and `j` literals rendered as `j1.2`;
   - `fromLatex(latex)`: for a documented subset only (numbers, identifiers with simple subscripts, `+ - \cdot \frac`, `^{}`, parentheses, `\left( \right)`, `\operatorname`, `\Gamma`, `\pi`, `j`), returning SmithLab text or an error.
2. **Round-trip tests** over every expression string in `tests/expression-*.test.ts` and `tests/curve-expressions.test.ts`. The success criterion is an identical AST after `text → AST → LaTeX → text → AST`.
3. **UI:**
   - A per-row "Σ" toggle that dynamically imports `mathlive` and mounts one `<math-field>`.
   - On every change, the field's LaTeX goes through `fromLatex`. Valid input updates the row text; invalid input shows the converter's error and leaves the text unchanged.
4. **Measure:** the bundle delta (lazy chunk size, gzipped); keyboard-only use; VoiceOver/NVDA readout of `zL = 0.5 + j1.2`; and typing latency on the curve example.
5. **Decide** based on the measurements. Reject the integration if round-trips are lossy, or if the lazy chunk is out of proportion to the benefit.
