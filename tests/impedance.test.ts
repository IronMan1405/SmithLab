import { describe, expect, it } from 'vitest';
import {
  COMPLEX_INFINITY,
  complex,
  denormalizeImpedance,
  isInfinite,
  normalizeImpedance,
} from '../src/core';
import { expectComplexClose } from './helpers';

describe('impedance normalisation', () => {
  it('normalises real impedances: z = Z/Z₀', () => {
    expectComplexClose(normalizeImpedance(complex(100, 0), 50), complex(2, 0));
    expectComplexClose(normalizeImpedance(complex(50, 0)), complex(1, 0));
  });

  it('normalises complex impedances', () => {
    expectComplexClose(normalizeImpedance(complex(25, -75), 50), complex(0.5, -1.5));
    expectComplexClose(normalizeImpedance(complex(75, 75), 75), complex(1, 1));
  });

  it('denormalises: Z = z·Z₀, and round-trips', () => {
    expectComplexClose(denormalizeImpedance(complex(0.5, -1.5), 50), complex(25, -75));
    const Z = complex(12.3, 45.6);
    expectComplexClose(denormalizeImpedance(normalizeImpedance(Z, 75), 75), Z);
  });

  it('passes open circuit (∞) through unchanged', () => {
    expect(isInfinite(normalizeImpedance(COMPLEX_INFINITY, 50))).toBe(true);
    expect(isInfinite(denormalizeImpedance(COMPLEX_INFINITY, 50))).toBe(true);
  });

  it('rejects invalid reference impedances', () => {
    for (const z0 of [0, -50, NaN, Infinity]) {
      expect(() => normalizeImpedance(complex(50, 0), z0)).toThrow(RangeError);
      expect(() => denormalizeImpedance(complex(1, 0), z0)).toThrow(RangeError);
    }
  });

  it('rejects NaN impedances', () => {
    expect(() => normalizeImpedance(complex(NaN, 0), 50)).toThrow(RangeError);
  });
});
