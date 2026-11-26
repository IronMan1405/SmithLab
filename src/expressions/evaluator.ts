/**
 * Evaluates an AST to a typed value using the core complex arithmetic.
 * Never throws for user mistakes: callers catch `EvaluationError`.
 */
import { add, complex, div, isNaNComplex, mul, neg, sub, type Complex, abs, arg, fromPolar } from '../core';
import type { Node, Span } from './ast';
import { CONSTANTS, FUNCTIONS, type FunctionContext } from './functions';
import { type BinaryOp, type TypedValue, TypeMismatch, binaryResultType, plainType } from './types';

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
  readonly lookup: (name: string, span: Span) => TypedValue;
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

export function evaluate(node: Node, ctx: EvaluationContext): TypedValue {
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

function checked(value: TypedValue, span: Span): TypedValue {
  if (isNaNComplex(value.value)) {
    throw new EvaluationError('math', 'Result is undefined (an indeterminate form such as 0/0 or ∞−∞)', span);
  }
  return value;
}

function evalNode(node: Node, ctx: EvaluationContext): TypedValue {
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
      const operand = evalNode(node.operand, ctx);
      return node.op === '-' ? { type: operand.type, value: neg(operand.value) } : operand;
    }
    case 'binary': {
      const left = evalNode(node.left, ctx);
      const right = evalNode(node.right, ctx);
      return withSpan(node.span, () => {
        const resultType = binaryResultType(node.op, left.type, right.type, right.type === 'real', left.type === 'real');
        const value = compute(node.op, left.value, right.value);
        const type = resultType === 'plain' ? plainType(value, left.type === 'real' && right.type === 'real') : resultType;
        return checked({ type, value }, node.span);
      });
    }
    case 'call': {
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
      const args = node.args.map((a) => evalNode(a, ctx));
      return withSpan(node.span, () => checked(spec.apply(args, ctx, node.name), node.span));
    }
  }
}
