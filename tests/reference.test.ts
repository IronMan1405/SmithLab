import { describe, expect, it } from 'vitest';
import {
  CONSTANTS,
  CURVE_FUNCTIONS,
  CURVE_SPECIAL_FORM,
  EXAMPLE_SETS,
  FUNCTIONS,
  FUNCTION_META,
  NAMING_CONVENTION,
  OPERATOR_RULES,
  PARAMETRIC_FORMS,
  type ReferenceResultType,
  createExpressionDef,
  declaredTypeForName,
  documentedFunctionNames,
  evaluateExpressions,
  exampleSetNames,
  functionsInCategory,
  parse,
  referenceConstants,
  referenceTypes,
  sliderLiteral,
} from '../src/expressions';

function evaluate(lines: readonly string[]) {
  const defs = lines.map((text, i) => createExpressionDef(`e${i}`, text));
  return [...evaluateExpressions(defs, 50).results.values()];
}

function resultType(r: ReturnType<typeof evaluate>[number]): ReferenceResultType | 'error' {
  if (r.status !== 'ok') return 'error';
  return r.curve ? 'curve' : r.value!.type;
}

describe('expression reference: coverage', () => {
  it('documents exactly the functions in the registries', () => {
    const registry = [...Object.keys(FUNCTIONS), ...Object.keys(CURVE_FUNCTIONS)].sort();
    expect(documentedFunctionNames().sort()).toEqual(registry);
  });

  it('documents the curve() special form, which the evaluator handles', () => {
    expect(PARAMETRIC_FORMS.has(CURVE_SPECIAL_FORM.name)).toBe(true);
  });

  it('lists exactly the built-in constants', () => {
    expect(referenceConstants().map((c) => c.name).sort()).toEqual(Object.keys(CONSTANTS).sort());
  });

  it('takes signatures and descriptions from the registry', () => {
    const line = functionsInCategory('rf').find((f) => f.name === 'line')!;
    expect(line.syntax).toBe(`line${FUNCTIONS.line!.signature}`);
    expect(line.description).toBe(FUNCTIONS.line!.description);
    const path = functionsInCategory('curve').find((f) => f.name === 'linePath')!;
    expect(path.syntax).toBe('linePath(x, l) or linePath(x, l0, l1)');
  });

  it('every category is non-empty', () => {
    for (const c of ['math', 'complex', 'rf', 'curve', 'query'] as const) expect(functionsInCategory(c).length).toBeGreaterThan(0);
  });
});

describe('expression reference: examples are accurate', () => {
  it.each(Object.entries(FUNCTION_META))('%s example evaluates to its documented type', (name, meta) => {
    expect(meta.example.startsWith(`${name}(`) || meta.example.includes(`${name}(`)).toBe(true);
    const [r] = evaluate([meta.example]);
    expect(r!.status, `${meta.example}: ${r!.error?.message}`).toBe('ok');
    expect(resultType(r!)).toBe(meta.exampleType);
  });

  it('example arities match the registry', () => {
    for (const [name, meta] of Object.entries(FUNCTION_META)) {
      const parsed = parse(meta.example);
      if (!parsed.ok) throw new Error(parsed.message);
      const calls: { name: string; args: number }[] = [];
      const walk = (n: import('../src/expressions').Node): void => {
        if (n.kind === 'call') {
          calls.push({ name: n.name, args: n.args.length });
          n.args.forEach(walk);
        } else if (n.kind === 'binary') {
          walk(n.left);
          walk(n.right);
        } else if (n.kind === 'unary') walk(n.operand);
      };
      walk(parsed.statement.body);
      const call = calls.find((c) => c.name === name)!;
      const spec = FUNCTIONS[name] ?? CURVE_FUNCTIONS[name]!;
      expect(spec.arity).toContain(call.args);
    }
  });

  it('the curve() example evaluates to a curve', () => {
    expect(resultType(evaluate([CURVE_SPECIAL_FORM.example])[0]!)).toBe('curve');
  });

  it.each(OPERATOR_RULES.map((r) => [r.expression, r] as const))('operator rule: %s', (_, rule) => {
    const results = evaluate([...rule.given, rule.expression]);
    expect(results.slice(0, -1).every((r) => r.status === 'ok')).toBe(true);
    expect(resultType(results.at(-1)!)).toBe(rule.result);
  });

  it('naming convention examples match declaredTypeForName', () => {
    for (const rule of NAMING_CONVENTION) {
      for (const name of rule.matches) expect(declaredTypeForName(name), name).toBe(rule.type);
      for (const name of rule.nonMatches) expect(declaredTypeForName(name), name).toBeNull();
    }
  });

  it('type list covers every value type plus curves, with correct plotting notes', () => {
    const types = referenceTypes();
    expect(types.map((t) => t.type)).toEqual(['real', 'complex', 'impedance', 'admittance', 'reflection', 'physicalImpedance', 'length', 'curve']);
    expect(types.find((t) => t.type === 'impedance')!.display).toMatch(/plotted as a point/);
    expect(types.find((t) => t.type === 'complex')!.display).toMatch(/not plotted/);
  });
});

describe('expression reference: practical example sets', () => {
  it.each(EXAMPLE_SETS.map((s) => [s.title, s] as const))('"%s" evaluates without errors', (_, set) => {
    const results = evaluate(set.lines.map((l) => l.text));
    for (const r of results) expect(r.status, `${r.name}: ${r.error?.message}`).toBe('ok');
  });

  it('example sets use distinct names, so several can be inserted together', () => {
    const all = EXAMPLE_SETS.flatMap(exampleSetNames);
    expect(new Set(all).size).toBe(all.length);
    const results = evaluate(EXAMPLE_SETS.flatMap((s) => s.lines.map((l) => l.text)));
    expect(results.every((r) => r.status === 'ok')).toBe(true);
  });

  it('slider lines are slider-compatible literals', () => {
    for (const set of EXAMPLE_SETS) for (const line of set.lines) if (line.slider) expect(sliderLiteral(line.text)).not.toBeNull();
  });

  it('the quarter-wave example demonstrates z_in·z_L = 1', () => {
    const set = EXAMPLE_SETS.find((s) => s.id === 'quarter')!;
    const check = evaluate(set.lines.map((l) => l.text)).at(-1)!;
    expect(check.value!.value.re).toBeCloseTo(1, 12);
    expect(check.value!.value.im).toBeCloseTo(0, 12);
  });

  it('exampleSetNames extracts assigned names', () => {
    expect(exampleSetNames(EXAMPLE_SETS.find((s) => s.id === 'match')!)).toEqual(['zC', 'vswrC', 'rUnit', 'pA', 'pB']);
  });
});
