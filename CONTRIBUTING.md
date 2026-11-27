# Contributing to SmithLab

Thanks for your interest in SmithLab. It is a young project maintained by one
person, so the most helpful contributions right now are clear bug reports,
well-argued suggestions, and small, focused pull requests.

## Reporting bugs and suggesting features

Use the issue templates on GitHub.

- For a bug, include the **expression text** that shows it (paste the rows),
  what you expected, what happened, and your browser. Expression text is the
  whole state of a construction, so it is usually enough to reproduce a
  problem.
- For a feature, describe the RF or mathematical task you are trying to do.
  The aim is a small set of composable functions rather than many special
  cases.
- For anything larger than a small fix, please open an issue to discuss it
  before writing code.
- Security issues: see [SECURITY.md](SECURITY.md). Do not open a public issue.

## Development setup

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm test             # all tests (Vitest)
npm run typecheck    # TypeScript strict-mode check
npm run build        # type-check and production build into dist/
```

Before opening a pull request, run `npm test` and `npm run build` (which
includes the type check). CI runs the same commands on Node 22 and 24.

## Where things live

The source is split into layers, described in
[docs/architecture.md](docs/architecture.md):

- `src/core`: complex numbers and RF formulas;
- `src/geometry`: everything in the Γ-plane (circles, curves, intersections);
- `src/expressions`: the expression language;
- `src/workspace`, `src/interaction`, `src/chart`, `src/components`: state,
  input, rendering and UI.

The pure layers (`core`, `geometry`, `expressions`, `workspace`) must not use
React or the DOM. Tests live in `tests/` and run in Node.

## Principles

Changes should keep these properties:

- **Exactness.** If a curve has a closed form, compute it exactly rather than
  sampling it. Do not loosen tolerances to make a test pass; explain the
  numerical issue instead.
- **The expression text is the only stored state.** Do not add hidden state
  that an expression cannot reproduce.
- **Types mean something.** New functions should accept and return typed
  values, and reject meaningless combinations with a helpful message.
- **Views do not change values.** Coordinate modes, themes and zoom affect
  drawing only.
- **No new runtime dependencies** without discussion. The app currently ships
  only React.

## Adding or changing a function

1. Add it to the registry in `src/expressions/functions.ts` (point-valued) or
   `src/expressions/curve-functions.ts` (curves and queries), with a signature
   and description.
2. Add its category, return type and a runnable example to `FUNCTION_META` in
   `src/expressions/reference.ts`. `tests/reference.test.ts` fails if a
   function is undocumented or its example does not evaluate to the stated
   type.
3. Add tests, including the mathematical identities it should satisfy and its
   error cases.
4. Document it in [docs/expressions.md](docs/expressions.md), and the
   mathematics in [docs/mathematics.md](docs/mathematics.md) if it is new.

## Style

- TypeScript in strict mode (see `tsconfig.json`); unused locals and
  parameters are errors.
- There is no formatter configured. Follow the style of the surrounding code:
  two-space indentation, single quotes, semicolons.
- Keep modules small and pure where possible, and explain the mathematics in
  comments at the top of a module.
- Update documentation and `CHANGELOG.md` (under an "Unreleased" heading) for
  user-visible changes.

## Pull requests

- Keep each pull request to one change, and describe what it changes and why.
- Include tests for behaviour changes.
- Mention any limitation or numerical caveat you know about.

## Licence of contributions

SmithLab is licensed under the [Apache License 2.0](LICENSE). By submitting a
contribution, you agree that it is licensed under the same terms, as described
in section 5 of the licence. There is no separate contributor agreement.
