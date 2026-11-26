/**
 * Evaluates an AST to a value (a typed scalar or a curve) using the core
 * complex arithmetic. Never throws for user mistakes: callers catch
 * `EvaluationError`.
 *
 * `curve(body, t, t0, t1)` is a special form: `body` is not evaluated
 * immediately but becomes Γ(t) of a parametric curve, with `t` bound as a
 * real number for each evaluation.
 */
import { add, complex, div, isNaNComplex, mul, neg, sub, type Complex, abs, arg, fromPolar } from '../core';
import { parametricCurve } from '../geometry/curves';
import type { Node, Span } from './ast';
import { CURVE_FUNCTIONS } from './curve-functions';
import { CONSTANTS, FUNCTIONS, type FunctionContext, isReservedName, toReflection } from './functions';
import { type BinaryOp, type TypedValue, type Value, TYPE_INFO, TypeMismatch, binaryResultType, isCurve, plainType } from './types';

export type ErrorKind = 'syntax' | 'reference' | 'dependency' | 'cycle' | 'type' | 'math' | 'name';

export class EvaluationError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly span: Span | null = null,
  ) {
    super(message);
    this.name = 'EvaluationError';
  }
}

export interface EvaluationContext extends FunctionContext {
  /** Resolve a variable; throws EvaluationError if it is unavailable. */
  readonly lookup: (name: string, span: Span) => Value;
}

function power(base: Complex, exponent: Complex): Complex {
  if (exponent.im === 0 && Number.isInteger(exponent.re) && Math.abs(exponent.re) <= 64) {
    // Exact repeated multiplication for small integer powers.
    let result = complex(1, 0);
    for (let i = 0; i < Math.abs(exponent.re); i++) result = mul(result, base);
    return exponent.re < 0 ? div(complex(1, 0), result) : result;
  }
  if (base.re === 0 && base.im === 0) return complex(0, 0);
  // base^w = exp(w · ln base), principal branch.
  const lnBase = complex(Math.log(abs(base)), arg(base));
  const w = mul(exponent, lnBase);
  return fromPolar(Math.exp(w.re), w.im);
}

function compute(op: BinaryOp, a: Complex, b: Complex): Complex {
  switch (op) {
    case '+':
      return add(a, b);
    case '-':
      return sub(a, b);
    case '*':
      return mul(a, b);
    case '/':
      return div(a, b);
    case '^':
      return power(a, b);
  }
}

export function evaluate(node: Node, ctx: EvaluationContext): Value {
  try {
    return evalNode(node, ctx);
  } catch (error) {
    if (error instanceof TypeMismatch) throw new EvaluationError('type', error.message, node.span);
    if (error instanceof RangeError) throw new EvaluationError('math', error.message, node.span);
    throw error;
  }
}

function withSpan<T>(span: Span, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof TypeMismatch) throw new EvaluationError('type', error.message, span);
    if (error instanceof RangeError) throw new EvaluationError('math', error.message, span);
    throw error;
  }
}

function checked(value: Value, span: Span): Value {
  if (!isCurve(value) && isNaNComplex(value.value)) {
    throw new EvaluationError('math', 'Result is undefined (an indeterminate form such as 0/0 or ∞−∞)', span);
  }
  return value;
}

function scalarOperand(v: Value, span: Span): TypedValue {
  if (isCurve(v)) throw new EvaluationError('type', 'Arithmetic on curves is not supported; use a curve function such as intersect() or at()', span);
  return v;
}

function evalNode(node: Node, ctx: EvaluationContext): Value {
  switch (node.kind) {
    case 'number':
      return { type: 'real', value: complex(node.value, 0) };
    case 'imaginary':
      return { type: 'complex', value: complex(0, node.value) };
    case 'identifier': {
      const constant = CONSTANTS[node.name];
      if (constant) return constant;
      return ctx.lookup(node.name, node.span);
    }
    case 'unary': {
      const operand = scalarOperand(evalNode(node.operand, ctx), node.span);
      return node.op === '-' ? { type: operand.type, value: neg(operand.value) } : operand;
    }
    case 'binary': {
      const left = scalarOperand(evalNode(node.left, ctx), node.left.span);
      const right = scalarOperand(evalNode(node.right, ctx), node.right.span);
      return withSpan(node.span, () => {
        const resultType = binaryResultType(node.op, left.type, right.type, right.type === 'real', left.type === 'real');
        const value = compute(node.op, left.value, right.value);
        const type = resultType === 'plain' ? plainType(value, left.type === 'real' && right.type === 'real') : resultType;
        return checked({ type, value }, node.span);
      });
    }
    case 'call': {
      if (node.name === 'curve') return parametric(node, ctx);
      const curveSpec = CURVE_FUNCTIONS[node.name];
      if (curveSpec) {
        if (!curveSpec.arity.includes(node.args.length)) {
          throw new EvaluationError('syntax', `${node.name}${curveSpec.signature}: wrong number of arguments (${node.args.length})`, node.span);
        }
        const args = node.args.map((a) => evalNode(a, ctx));
        return withSpan(node.span, () => checked(curveSpec.apply(args, ctx, node.name), node.span));
      }
      const spec = FUNCTIONS[node.name];
      if (!spec) {
        throw new EvaluationError('reference', `Unknown function "${node.name}"`, node.span);
      }
      if (!spec.arity.includes(node.args.length)) {
        throw new EvaluationError(
          'syntax',
          `${node.name}${spec.signature} takes ${spec.arity.join(' or ')} argument${spec.arity[0] === 1 ? '' : 's'}, got ${node.args.length}`,
          node.span,
        );
      }
      const args = node.args.map((a) => {
        const v = evalNode(a, ctx);
        if (isCurve(v)) throw new EvaluationError('type', `${node.name}() expects a number, not a curve`, a.span);
        return v;
      });
      return withSpan(node.span, () => checked(spec.apply(args, ctx, node.name), node.span));
    }
  }
}

const PLOTTABLE_HINT = 'The curve expression must give an impedance, admittance or reflection coefficient: wrap it in z(…), y(…) or gamma(…)';

/** `curve(body, t, t0, t1)`: Γ(t) over [t0, t1]. */
function parametric(node: Extract<Node, { kind: 'call' }>, ctx: EvaluationContext): Value {
  if (node.args.length !== 4) {
    throw new EvaluationError('syntax', 'curve(expression, t, t0, t1) takes 4 arguments', node.span);
  }
  const [body, param, from, to] = node.args as [Node, Node, Node, Node];
  if (param.kind !== 'identifier') {
    throw new EvaluationError('syntax', 'The second argument of curve() must be a parameter name, e.g. t', param.span);
  }
  if (isReservedName(param.name)) {
    throw new EvaluationError('name', `"${param.name}" is a built-in constant and cannot be a curve parameter`, param.span);
  }
  const bound = (v: Value, span: Span): number => {
    if (isCurve(v) || (v.type !== 'real' && v.type !== 'length')) {
      throw new EvaluationError('type', 'curve() parameter bounds must be real numbers', span);
    }
    return v.value.re;
  };
  const t0 = bound(evalNode(from, ctx), from.span);
  const t1 = bound(evalNode(to, ctx), to.span);
  if (!(t0 < t1)) throw new EvaluationError('math', `curve() needs ${param.name}0 < ${param.name}1 (got ${t0} and ${t1})`, node.span);

  /** Evaluate the body with the parameter bound to t. */
  const at = (t: number): Value => {
    const local: EvaluationContext = {
      ...ctx,
      lookup: (name, span) => (name === param.name ? { type: 'real', value: complex(t, 0) } : ctx.lookup(name, span)),
    };
    return evalNode(body, local);
  };

  // Probe a few parameter values: static problems (unknown names, wrong
  // types) are reported now; mathematical failures only mark singular points.
  let sampleType: TypedValue['type'] | null = null;
  for (const t of [t0, (t0 + t1) / 2, t1, t0 + (t1 - t0) * 0.2731, t0 + (t1 - t0) * 0.7139]) {
    try {
      const v = at(t);
      if (isCurve(v)) throw new EvaluationError('type', 'curve() cannot produce a curve of curves', body.span);
      if (!TYPE_INFO[v.type].plottable) throw new EvaluationError('type', `${PLOTTABLE_HINT} (got a ${TYPE_INFO[v.type].label})`, body.span);
      sampleType = v.type;
      toReflection(v, ctx, 'curve'); // records a Z₀ dependency for physical impedances
      break;
    } catch (error) {
      if (error instanceof EvaluationError && error.kind === 'math') continue;
      if (error instanceof TypeMismatch) throw new EvaluationError('type', error.message, body.span);
      throw error;
    }
  }
  if (!sampleType) throw new EvaluationError('math', 'curve() is undefined over the whole interval', node.span);

  const type = sampleType;
  const point = (t: number): Complex | null => {
    try {
      const v = at(t);
      if (isCurve(v) || v.type !== type) return null;
      const g = toReflection(v, ctx, 'curve');
      return Number.isFinite(g.re) && Number.isFinite(g.im) ? g : null;
    } catch {
      return null; // singular point
    }
  };
  return { type: 'curve', curve: parametricCurve(point, param.name, t0, t1, [{ label: 'of', value: TYPE_INFO[type].label }]) };
}
