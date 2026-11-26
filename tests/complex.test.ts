import { describe, expect, it } from 'vitest';
import {
  COMPLEX_INFINITY,
  ONE,
  ZERO,
  abs,
  add,
  arg,
  assertComplex,
  complex,
  conj,
  div,
  fromPolar,
  isInfinite,
  isNaNComplex,
  mul,
  reciprocal,
  sub,
} from '../src/core';
import { expectComplexClose } from './helpers';

describe('complex arithmetic', () => {
  const a = complex(3, 4);
  const b = complex(1, -2);

  it('adds and subtracts', () => {
    expect(add(a, b)).toEqual(complex(4, 2));
    expect(sub(a, b)).toEqual(complex(2, 6));
  });

  it('multiplies', () => {
    // (3 + 4j)(1 − 2j) = 3 − 6j + 4j + 8 = 11 − 2j
    expect(mul(a, b)).toEqual(complex(11, -2));
  });

  it('divides', () => {
    // (3 + 4j)/(1 − 2j) = (3 + 4j)(1 + 2j)/5 = (−5 + 10j)/5 = −1 + 2j
    expectComplexClose(div(a, b), complex(-1, 2));
    expectComplexClose(mul(div(a, b), b), a);
  });

  it('divides by divisors with |im| > |re| (second Smith branch)', () => {
    expectComplexClose(div(complex(1, 1), complex(1, 3)), complex(0.4, -0.2));
  });

  it('computes magnitude, argument and conjugate', () => {
    expect(abs(a)).toBe(5);
    expect(arg(complex(0, 1))).toBeCloseTo(Math.PI / 2, 15);
    expect(arg(complex(-1, 0))).toBeCloseTo(Math.PI, 15);
    expect(conj(a)).toEqual(complex(3, -4));
  });

  it('defines arg(0) = 0, including signed zeros', () => {
    expect(arg(ZERO)).toBe(0);
    expect(arg(complex(-0, -0))).toBe(0);
  });

  it('computes reciprocals', () => {
    expectComplexClose(reciprocal(complex(0, 1)), complex(0, -1));
    expectComplexClose(mul(reciprocal(a), a), ONE);
  });

  it('round-trips polar form', () => {
    expectComplexClose(fromPolar(abs(a), arg(a)), a);
  });

  it('avoids overflow for very large operands in division', () => {
    const big = complex(1e300, 1e300);
    expectComplexClose(div(big, big), ONE);
  });
});

describe('extended complex plane conventions', () => {
  it('maps a/0 to ∞ and a/∞ to 0', () => {
    expect(isInfinite(div(ONE, ZERO))).toBe(true);
    expect(reciprocal(ZERO)).toBe(COMPLEX_INFINITY);
    expect(reciprocal(COMPLEX_INFINITY)).toEqual(ZERO);
    expect(div(complex(2, 3), COMPLEX_INFINITY)).toEqual(ZERO);
  });

  it('treats any infinite component as the single point at infinity', () => {
    expect(isInfinite(complex(-Infinity, 5))).toBe(true);
    expect(isInfinite(complex(0, Infinity))).toBe(true);
    expect(abs(complex(0, -Infinity))).toBe(Infinity);
    expect(Number.isNaN(arg(COMPLEX_INFINITY))).toBe(true);
  });

  it('returns NaN for indeterminate forms', () => {
    expect(isNaNComplex(div(ZERO, ZERO))).toBe(true);
    expect(isNaNComplex(div(COMPLEX_INFINITY, COMPLEX_INFINITY))).toBe(true);
    expect(isNaNComplex(mul(COMPLEX_INFINITY, ZERO))).toBe(true);
    expect(isNaNComplex(add(COMPLEX_INFINITY, COMPLEX_INFINITY))).toBe(true);
  });

  it('maps finite overflow to ∞ rather than NaN', () => {
    expect(isInfinite(mul(complex(1e200, 1e200), complex(1e200, 1e200)))).toBe(true);
  });

  it('rejects NaN input loudly in assertComplex', () => {
    expect(() => assertComplex(complex(NaN, 0))).toThrow(RangeError);
    expect(() => assertComplex({} as never)).toThrow(TypeError);
  });
});
