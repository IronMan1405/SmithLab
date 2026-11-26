import { expect } from 'vitest';
import { type Complex, approxEqual } from '../src/core';

export function expectComplexClose(actual: Complex, expected: Complex, tolerance = 1e-12): void {
  if (!approxEqual(actual, expected, tolerance)) {
    expect.fail(`expected ${actual.re} + j${actual.im} ≈ ${expected.re} + j${expected.im}`);
  }
}
