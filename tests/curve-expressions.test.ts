import { describe, expect, it } from 'vitest';
import { abs, complex, reflectionFromAdmittance, reflectionFromImpedance, reflectionThroughLine, vswrFromReflection } from '../src/core';
import { DEFAULT_VIEW, type Rect, gammaToScreen } from '../src/chart/viewport';
import { curvePath, toleranceBucket } from '../src/chart/curve-paths';
import {
  type ExpressionDef,
  createExpressionDef,
  draggableLiteral,
  evaluateExpressions,
  formatComplexLiteral,
  isDraggableExpression,
  parse,
  plottedGamma,
  referencedNames,
  rewriteForDrag,
  withSliderValue,
} from '../src/expressions';
import { displayCurve, intersectCurves, sampleCurve } from '../src/geometry';
import { type GestureContext, IDLE, pointerDown, pointerMove, pointerUp } from '../src/interaction/gestures';
import { createWorkspace, workspaceReducer as reduce } from '../src/workspace';
import { expectComplexClose } from './helpers';

const def = (id: string, text: string, extra: Partial<ExpressionDef> = {}): ExpressionDef => ({ ...createExpressionDef(id, text), ...extra });
const run = (...defs: ExpressionDef[]) => evaluateExpressions(defs, 50);

function curveOf(out: ReturnType<typeof run>, id: string) {
  const r = out.results.get(id)!;
  if (r.status !== 'ok' || !r.curve) throw new Error(`${r.status}: ${r.error?.message}`);
  return r.curve;
}

describe('curve constructions in expressions', () => {
  it('vswrCircle from a VSWR number or through a point', () => {
    const out = run(def('a', 'c1 = vswrCircle(2)'), def('z', 'zL = 0.5 + j1.2'), def('b', 'c2 = vswrCircle(zL)'));
    const c1 = curveOf(out, 'a');
    expect(c1.shape).toMatchObject({ kind: 'circle', radius: 1 / 3 });
    const c2 = curveOf(out, 'b');
    const g = reflectionFromImpedance(complex(0.5, 1.2));
    expect(c2.shape?.kind === 'circle' && c2.shape.radius).toBeCloseTo(abs(g), 14);
    expect(vswrFromReflection(c2.point(0.3)!)).toBeCloseTo(vswrFromReflection(g), 10);
    expect(out.results.get('a')!.value).toBeNull();
    expect(out.results.get('a')!.plot).toBeNull();
  });

  it('rCircle / xCircle accept numbers or the parts of an impedance', () => {
    const out = run(def('z', 'zL = 0.5 + j1.2'), def('r', 'cr = rCircle(zL)'), def('x', 'cx = xCircle(zL)'), def('n', 'cn = xCircle(-0.5)'));
    expect(curveOf(out, 'r').properties[0]).toEqual({ label: 'r', value: '0.5' });
    expect(curveOf(out, 'x').properties[0]).toEqual({ label: 'x', value: '1.2' });
    expect(curveOf(out, 'n').point(1)!.im).toBeLessThan(0);
  });

  it('gCircle / bCircle are admittance-number curves: on the admittance grid in admittance mode', () => {
    const out = run(def('y', 'yL = 1 + j0.4'), def('g', 'cg = gCircle(yL)'));
    const cg = curveOf(out, 'g');
    expect(cg.domain).toBe('admittance');
    expectComplexClose(displayCurve(cg, 'admittance').point(0.4)!, reflectionFromAdmittance(complex(1, 0.4)), 1e-15);
    expectComplexClose(displayCurve(cg, 'impedance').point(0.4)!, reflectionFromImpedance(complex(1, 0.4)), 1e-15);
  });

  it('linePath follows Γ_L·e^(−j4πl) over [0, l] or [l0, l1]', () => {
    const out = run(def('z', 'zL = 2'), def('a', 'p1 = linePath(zL, 0.125)'), def('b', 'p2 = linePath(zL, 0.1, 0.3)'));
    const p1 = curveOf(out, 'a');
    expectComplexClose(p1.point(0.125)!, complex(0, -1 / 3), 1e-12);
    expect(p1.shape?.kind === 'arc' && p1.shape.sweep).toBeCloseTo(-Math.PI / 2, 12);
    const p2 = curveOf(out, 'b');
    expect(p2.parameter).toMatchObject({ min: 0.1, max: 0.3 });
    expectComplexClose(p2.point(0.2)!, reflectionThroughLine(complex(1 / 3, 0), 0.2));
  });

  it('reports invalid constructions as errors', () => {
    const out = run(def('a', 'c = vswrCircle(0.5)'), def('b', 'c2 = rCircle(-1)'), def('y', 'yL = 1'), def('c', 'c3 = rCircle(yL)'), def('d', 'c4 = linePath(z(2), 0)'));
    expect(out.results.get('a')!.error!.message).toMatch(/VSWR ≥ 1/);
    expect(out.results.get('b')!.error!.message).toMatch(/r ≥ 0/);
    expect(out.results.get('c')!.error!.message).toMatch(/normalized impedance/);
    expect(out.results.get('d')!.error!.message).toMatch(/non-empty length range/);
  });

  it('curves cannot be used in arithmetic or as numbers, and must not use typed names', () => {
    const out = run(def('a', 'c1 = rCircle(1)'), def('b', 'k = c1 + 1'), def('c', 'k2 = abs(c1)'), def('d', 'zC = rCircle(1)'));
    expect(out.results.get('b')!.error!.message).toMatch(/Arithmetic on curves/);
    expect(out.results.get('c')!.error!.message).toMatch(/expects a number, not a curve/);
    expect(out.results.get('d')!.error!.message).toMatch(/named like a normalized impedance, but the expression is a curve/);
  });
});

describe('curve(expr, t, t0, t1)', () => {
  it('excludes the bound parameter from dependencies', () => {
    const r = parse('c = curve(gammaL * exp(-j*4*pi*t), t, 0, lMax)');
    if (!r.ok) throw new Error(r.message);
    expect([...referencedNames(r.statement.body)].sort()).toEqual(['gammaL', 'j', 'lMax', 'pi']);
  });

  it('evaluates over the interval and matches the line-path construction', () => {
    const out = run(def('g', 'gammaL = 0.3 + j0.4'), def('c', 'c = curve(gammaL * exp(-j*4*pi*t), t, 0, 0.5)'));
    const c = curveOf(out, 'c');
    expect(c.kind).toBe('parametric');
    expect(c.shape).toBeNull();
    expect(c.parameter).toMatchObject({ name: 't', min: 0, max: 0.5 });
    for (const t of [0, 0.07, 0.2, 0.45]) expectComplexClose(c.point(t)!, reflectionThroughLine(complex(0.3, 0.4), t), 1e-12);
  });

  it('a local t shadows a global t', () => {
    const out = run(def('t', 't = 99'), def('c', 'c = curve(gamma(0.5*t), t, 0, 1)'));
    expectComplexClose(curveOf(out, 'c').point(0.5)!, complex(0.25, 0));
  });

  it('converts z / y / Z bodies to Γ', () => {
    const out = run(def('c', 'c = curve(z(1 + j*t), t, -2, 2)'), def('d', 'd = curve(Z(50 + j*t), t, -100, 100)'));
    expectComplexClose(curveOf(out, 'c').point(1)!, reflectionFromImpedance(complex(1, 1)));
    expectComplexClose(curveOf(out, 'd').point(50)!, reflectionFromImpedance(complex(1, 1)));
    expect(out.results.get('d')!.usesZ0).toBe(true);
  });

  it('rejects bodies without a chart meaning, bad parameters and bad bounds', () => {
    const out = run(
      def('a', 'c1 = curve(0.5*exp(j*t), t, 0, 1)'),
      def('b', 'c2 = curve(gamma(t), 2, 0, 1)'),
      def('c', 'c3 = curve(gamma(t), t, 1, 0)'),
      def('d', 'c4 = curve(gamma(t), pi, 0, 1)'),
      def('e', 'c5 = curve(gamma(t*q), t, 0, 1)'),
    );
    expect(out.results.get('a')!.error!.message).toMatch(/wrap it in z\(…\), y\(…\) or gamma\(…\)/);
    expect(out.results.get('b')!.error!.message).toMatch(/parameter name/);
    expect(out.results.get('c')!.error!.message).toMatch(/t0 < t1/);
    expect(out.results.get('d')!.error!.message).toMatch(/built-in constant/);
    expect(out.results.get('e')!.error!.message).toBe('"q" is not defined');
  });

  it('singular points become gaps rather than errors, and jumps are not joined', () => {
    // t/abs(t) is 0/0 at t = 0 and jumps from −1 to +1 there.
    const out = run(def('c', 'c = curve(gamma(0.5*t/abs(t) + j*0.2*t), t, -1, 1)'));
    const c = curveOf(out, 'c');
    expect(c.point(0)).toBeNull();
    expectComplexClose(c.point(0.5)!, complex(0.5, 0.1), 1e-12);
    expectComplexClose(c.point(-0.5)!, complex(-0.5, -0.1), 1e-12);
    const { polylines } = sampleCurve(c.point, -1, 1, { tolerance: 1e-5 });
    expect(polylines).toHaveLength(2);
    expect(polylines[0]!.every((s) => s.p.re === -0.5)).toBe(true);
    expect(polylines[1]!.every((s) => s.p.re === 0.5)).toBe(true);
  });
});

describe('reactivity', () => {
  it('upstream changes update dependent curves; unrelated curves are reused', () => {
    const list = [def('z', 'zL = 0.5 + j1.2'), def('v', 'c1 = vswrCircle(zL)'), def('r', 'c2 = rCircle(1)')];
    const first = evaluateExpressions(list, 50);
    const second = evaluateExpressions(list.map((d) => (d.id === 'z' ? { ...d, text: 'zL = 2' } : d)), 50, first);
    expect([...second.recomputed].sort()).toEqual(['v', 'z']);
    expect(second.results.get('r')!.curve).toBe(first.results.get('r')!.curve); // same object: no resample
    expect(curveOf(second, 'v').shape).toMatchObject({ radius: 1 / 3 });
  });

  it('slider-driven line path updates', () => {
    let s = createWorkspace();
    s = reduce(s, { type: 'expression/add', id: 'z', text: 'zL = 2' });
    s = reduce(s, { type: 'expression/add', id: 'l', text: 'l = 0.1' });
    s = reduce(s, { type: 'expression/add', id: 'p', text: 'path = linePath(zL, l)' });
    const before = evaluateExpressions(s.expressions, 50);
    s = reduce(s, { type: 'expression/set-text', id: 'l', text: withSliderValue('l = 0.1', 0.25, 0.001)! });
    const after = evaluateExpressions(s.expressions, 50, before);
    expect([...after.recomputed].sort()).toEqual(['l', 'p']);
    expect(curveOf(after, 'p').parameter.max).toBe(0.25);
  });

  it('disabled and erroneous upstream expressions propagate to curves', () => {
    const out = run(def('z', 'zL = 2', { enabled: false }), def('v', 'c1 = vswrCircle(zL)'), def('w', 'c2 = rCircle(k)'));
    expect(out.results.get('v')!.error!.message).toBe('"zL" is disabled');
    expect(out.results.get('w')!.error!.message).toBe('"k" is not defined');
  });

  it('curve results are cached by identity in the renderer (tolerance buckets)', () => {
    const out = run(def('c', 'c = curve(gamma(0.5*exp(j*2*pi*t)), t, 0, 1)'));
    const c = curveOf(out, 'c');
    const a = curvePath(c, 1);
    expect(curvePath(c, 1)).toBe(a); // cached string
    expect(toleranceBucket(1)).toBe(toleranceBucket(1.05)); // small zoom change: same bucket
    expect(toleranceBucket(10)).toBeGreaterThan(toleranceBucket(1)); // zoomed out: coarser
  });
});

describe('intersections in expressions', () => {
  it('intersect(rCircle, xCircle) is the impedance r + jx (typed by the curves, so it moves with them)', () => {
    const out = run(def('a', 'cr = rCircle(0.5)'), def('b', 'cx = xCircle(1.2)'), def('p', 'p = intersect(cr, cx)'), def('q', 'q = intersect(cr, cx, 2)'));
    expect(out.results.get('p')!.value!.type).toBe('impedance');
    expectComplexClose(out.results.get('p')!.value!.value, complex(0.5, 1.2), 1e-12);
    expectComplexClose(plottedGamma(out.results.get('p'))!, reflectionFromImpedance(complex(0.5, 1.2)), 1e-12);
    // The second meeting point is Γ = 1: the impedance there is infinite (open circuit).
    expect(Number.isFinite(out.results.get('q')!.value!.value.re)).toBe(false);
    expectComplexClose(plottedGamma(out.results.get('q'))!, complex(1, 0), 1e-9);
  });

  it('reports out-of-range indices, misses (with closest approach) and coincidence', () => {
    const out = run(
      def('a', 'cr = rCircle(0.5)'),
      def('b', 'cx = xCircle(1.2)'),
      def('c', 'v = vswrCircle(1.5)'),
      def('d', 'r3 = rCircle(3)'),
      def('p', 'p = intersect(cr, cx, 3)'),
      def('q', 'q = intersect(v, r3)'),
      def('s', 's = intersect(cr, cr)'),
    );
    expect(out.results.get('p')!.error!.message).toBe('Only 2 intersections (asked for #3)');
    expect(out.results.get('q')!.error!.message).toMatch(/do not intersect \(closest approach/);
    expect(out.results.get('s')!.error!.message).toMatch(/coincide/);
  });

  it('intersection points update reactively', () => {
    const list = [def('k', 'k = 1'), def('a', 'cr = rCircle(k)'), def('v', 'v = vswrCircle(3)'), def('p', 'p = intersect(v, cr)')];
    const first = evaluateExpressions(list, 50);
    const second = evaluateExpressions(list.map((d) => (d.id === 'k' ? { ...d, text: 'k = 0.5' } : d)), 50, first);
    expect(abs(plottedGamma(second.results.get('p'))!)).toBeCloseTo(0.5, 12);
    expect(plottedGamma(second.results.get('p'))).not.toEqual(plottedGamma(first.results.get('p')));
  });

  it('at(c, t) gives a point on the curve', () => {
    const out = run(def('a', 'v = vswrCircle(3)'), def('p', 'p = at(v, 0.125)'));
    expectComplexClose(out.results.get('p')!.value!.value, complex(0, 0.5), 1e-12);
  });

  it('parametric curves intersect numerically', () => {
    const out = run(def('a', 'c = curve(gamma(0.5*exp(-j*4*pi*t)), t, 0, 0.5)'), def('b', 'r1 = rCircle(1)'));
    const r = intersectCurves(curveOf(out, 'a'), curveOf(out, 'b'));
    expect(r.points).toHaveLength(2);
    for (const p of r.points) {
      expect(abs(p.gamma)).toBeCloseTo(0.5, 9);
      expect(p.numerical).toBe(true);
    }
  });
});

describe('dragging expression points', () => {
  it('recognises literal point expressions only', () => {
    for (const t of ['zL = 0.5 + j1.2', 'zL = 0.5 - j1.2', 'zL = j2', 'zL = -j0.3', 'zL = 2', 'zL = -0.5 + j1', 'p = z(0.5 + j1)', 'g = gamma(0.3j)']) {
      expect(draggableLiteral(t), t).not.toBeNull();
    }
    for (const t of ['zL = zA + 1', 'zL = 1/zA', 'yL = y(zL)', 'zL = 2*(1 + j)', '0.5 + j1', 'zL = exp(j)', 'zL = j1 + 0.5']) {
      expect(draggableLiteral(t), t).toBeNull();
    }
    expect(draggableLiteral('p = z(0.5 + j1)')!.wrapper).toBe('z');
  });

  it('formats literals', () => {
    expect(formatComplexLiteral(0.5, 1.2, 4)).toBe('0.5 + j1.2');
    expect(formatComplexLiteral(0.123456, -0.5, 4)).toBe('0.1235 - j0.5');
    expect(formatComplexLiteral(0, 2, 4)).toBe('j2');
    expect(formatComplexLiteral(0, -2, 4)).toBe('-j2');
    expect(formatComplexLiteral(1.5, 0, 4)).toBe('1.5');
    expect(formatComplexLiteral(-0.00001, 0.00001, 4)).toBe('0');
  });

  it('rewrites the literal in the expression\'s own type', () => {
    const target = reflectionFromImpedance(complex(1, -0.5));
    const cases: [string, string][] = [
      ['zL = 0.5 + j1.2', 'zL = 1 - j0.5'],
      ['yL = 0.5 + j1.2', 'yL = 1 - j0.5'], // impedance mode: the y number is read on the Z grid
      ['gammaL = 0.1', `gammaL = ${formatComplexLiteral(target.re, target.im, 4)}`],
      ['ZL = 25 + j60', 'ZL = 50 - j25'], // Z₀ = 50
      ['p = z(0.5 + j1.2)', 'p = z(1 - j0.5)'],
    ];
    for (const [text, expected] of cases) {
      const d = def('a', text);
      const out = run(d);
      expect(isDraggableExpression(d, out.results.get('a'))).toBe(true);
      expect(rewriteForDrag(d, out.results.get('a'), target, 50)).toBe(expected);
    }
  });

  it('dragging updates dependents through normal re-evaluation', () => {
    const list = [def('z', 'zL = 0.5 + j1.2'), def('v', 'c1 = vswrCircle(zL)')];
    const first = evaluateExpressions(list, 50);
    const text = rewriteForDrag(list[0]!, first.results.get('z'), complex(0.5, 0), 50)!;
    expect(text).toBe('zL = 3');
    const second = evaluateExpressions([{ ...list[0]!, text }, list[1]!], 50, first);
    expect(curveOf(second, 'v').shape).toMatchObject({ radius: 0.5 });
  });

  it('refuses computed expressions and unrepresentable values', () => {
    const list = [def('a', 'zA = 1'), def('b', 'zB = zA + j')];
    const out = evaluateExpressions(list, 50);
    expect(isDraggableExpression(list[1]!, out.results.get('b'))).toBe(false);
    expect(rewriteForDrag(list[1]!, out.results.get('b'), complex(0.2, 0), 50)).toBeNull();
    // An impedance cannot be written at Γ = 1 (z = ∞).
    expect(rewriteForDrag(list[0]!, out.results.get('a'), complex(1, 0), 50)).toBeNull();
    // Plain complex numbers have no chart position, so they are not draggable.
    const plain = def('c', 'k = 0.5 + j1');
    expect(isDraggableExpression(plain, run(plain).results.get('c'))).toBe(false);
  });
});

describe('chart interaction with curves', () => {
  const RECT: Rect = { left: 0, top: 0, width: 800, height: 800 };
  const CTX: GestureContext = { rect: RECT, view: DEFAULT_VIEW, snap: true };

  it('pressing a curve selects it and a click never creates a point', () => {
    const p = gammaToScreen(complex(0.3, 0.1), RECT, DEFAULT_VIEW);
    const down = pointerDown(IDLE, { pointerId: 1, client: p, button: 0 }, { curveId: 'c1' }, CTX);
    expect(down.commands).toEqual([{ type: 'select', id: 'c1' }]);
    expect(pointerUp(down.gesture, { pointerId: 1, client: p }, CTX).commands).toEqual([]);
  });

  it('dragging from a curve pans the view', () => {
    const p = gammaToScreen(complex(0.3, 0.1), RECT, DEFAULT_VIEW);
    const down = pointerDown(IDLE, { pointerId: 1, client: p, button: 0 }, { curveId: 'c1' }, CTX);
    const move = pointerMove(down.gesture, { pointerId: 1, client: { x: p.x + 40, y: p.y } }, CTX);
    expect(move.gesture.kind).toBe('pan');
    expect(move.commands[0]!.type).toBe('view');
  });

  it('curves can be selected and coloured through the workspace', () => {
    let s = reduce(createWorkspace(), { type: 'expression/add', id: 'c', text: 'c1 = rCircle(1)' });
    s = reduce(s, { type: 'point/select', id: 'c' });
    expect(s.selectedId).toBe('c');
    s = reduce(s, { type: 'expression/set-color', id: 'c', color: 'violet' });
    expect(s.expressions[0]!.color).toBe('violet');
    expect(() => reduce(s, { type: 'expression/set-color', id: 'c', color: 'plaid' as never })).toThrow(RangeError);
  });
});
