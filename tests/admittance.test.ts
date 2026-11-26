import { describe, expect, it } from 'vitest';
import {
  COMPLEX_INFINITY,
  ONE,
  ZERO,
  admittanceFromImpedance,
  admittanceFromReflection,
  complex,
  denormalizeAdmittance,
  impedanceFromAdmittance,
  isInfinite,
  mul,
  neg,
  normalizeAdmittance,
  reflectionFromAdmittance,
  reflectionFromImpedance,
} from '../src/core';
import { expectComplexClose } from './helpers';

describe('admittance y = 1/z', () => {
  it('computes reciprocals of complex impedances', () => {
    // 1/(1 + j1) = (1 − j1)/2
    expectComplexClose(admittanceFromImpedance(complex(1, 1)), complex(0.5, -0.5));
    expectComplexClose(admittanceFromImpedance(complex(2, 0)), complex(0.5, 0));
  });

  it('satisfies z·y = 1 and round-trips', () => {
    for (const z of [complex(1, 1), complex(0.3, -2), complex(5, 0.1), complex(0, 1)]) {
      const y = admittanceFromImpedance(z);
      expectComplexClose(mul(z, y), ONE);
      expectComplexClose(impedanceFromAdmittance(y), z);
    }
  });

  it('short circuit has infinite admittance; open circuit has zero', () => {
    expect(isInfinite(admittanceFromImpedance(ZERO))).toBe(true);
    expect(admittanceFromImpedance(COMPLEX_INFINITY)).toEqual(ZERO);
    expect(impedanceFromAdmittance(ZERO)).toBe(COMPLEX_INFINITY);
  });

  it('matched load is y = 1', () => {
    expectComplexClose(admittanceFromImpedance(ONE), ONE);
  });

  it('normalises physical admittance: y = Y·Z₀', () => {
    expectComplexClose(normalizeAdmittance(complex(0.02, -0.01), 50), complex(1, -0.5));
    expectComplexClose(denormalizeAdmittance(complex(1, -0.5), 50), complex(0.02, -0.01));
    expect(() => normalizeAdmittance(ONE, 0)).toThrow(RangeError);
  });

  it('Γ from y equals Γ from z = 1/y, and equals −Γ_z(y)', () => {
    for (const y of [complex(0.5, 0.5), complex(2, -1), complex(0.1, 3)]) {
      expectComplexClose(reflectionFromAdmittance(y), reflectionFromImpedance(impedanceFromAdmittance(y)));
      expectComplexClose(reflectionFromAdmittance(y), neg(reflectionFromImpedance(y)));
      expectComplexClose(admittanceFromReflection(reflectionFromAdmittance(y)), y, 1e-12);
    }
  });

  it('places short and open correctly on the admittance chart', () => {
    expectComplexClose(reflectionFromAdmittance(COMPLEX_INFINITY), complex(-1, 0)); // short
    expectComplexClose(reflectionFromAdmittance(ZERO), ONE); // open
  });
});
