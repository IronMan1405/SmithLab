import { describe, expect, it } from 'vitest';
import {
  COMPLEX_INFINITY,
  ONE,
  ZERO,
  abs,
  complex,
  impedanceFromReflection,
  isInfinite,
  isOnBoundary,
  isPassiveReflection,
  reflectionFromImpedance,
} from '../src/core';
import { expectComplexClose } from './helpers';

describe('reflection coefficient Γ = (z − 1)/(z + 1)', () => {
  it('matched load: z = 1 gives Γ = 0', () => {
    expectComplexClose(reflectionFromImpedance(ONE), ZERO);
  });

  it('short circuit: z = 0 gives Γ = −1', () => {
    expectComplexClose(reflectionFromImpedance(ZERO), complex(-1, 0));
  });

  it('open circuit: z = ∞ gives Γ = +1 exactly', () => {
    expect(reflectionFromImpedance(COMPLEX_INFINITY)).toEqual(ONE);
  });

  it('open circuit limit: Γ → +1 as z → ∞', () => {
    let previous = Infinity;
    for (const r of [1e2, 1e4, 1e8, 1e12]) {
      const distance = abs(complex(1 - reflectionFromImpedance(complex(r, 0)).re, 0));
      expect(distance).toBeLessThan(previous);
      expect(distance).toBeCloseTo(2 / (r + 1), 12);
      previous = distance;
    }
    // Also along a complex direction.
    expectComplexClose(reflectionFromImpedance(complex(1e15, 1e15)), ONE, 1e-12);
  });

  it('z = 2 gives Γ = 1/3', () => {
    expectComplexClose(reflectionFromImpedance(complex(2, 0)), complex(1 / 3, 0));
  });

  it('z = 1 + j1 gives Γ = (j1)/(2 + j1) = 0.2 + j0.4', () => {
    // j/(2 + j) = j(2 − j)/5 = (1 + 2j)/5
    expectComplexClose(reflectionFromImpedance(complex(1, 1)), complex(0.2, 0.4));
  });

  it('z = 1 − j1 gives the conjugate Γ = 0.2 − j0.4', () => {
    expectComplexClose(reflectionFromImpedance(complex(1, -1)), complex(0.2, -0.4));
  });

  it('pure reactance lies on the unit circle', () => {
    for (const x of [-10, -1, -0.1, 0.3, 1, 7]) {
      const gamma = reflectionFromImpedance(complex(0, x));
      expect(abs(gamma)).toBeCloseTo(1, 14);
      expect(isOnBoundary(gamma)).toBe(true);
    }
  });

  it('inductive loads map to the upper half plane', () => {
    expect(reflectionFromImpedance(complex(0.5, 0.5)).im).toBeGreaterThan(0);
    expect(reflectionFromImpedance(complex(0.5, -0.5)).im).toBeLessThan(0);
  });

  it('z = −1 is the pole: Γ = ∞', () => {
    expect(isInfinite(reflectionFromImpedance(complex(-1, 0)))).toBe(true);
  });

  it('active loads (Re z < 0) map outside the unit disc and are flagged', () => {
    const gamma = reflectionFromImpedance(complex(-0.5, 0.2));
    expect(abs(gamma)).toBeGreaterThan(1);
    expect(isPassiveReflection(gamma)).toBe(false);
    expect(isPassiveReflection(reflectionFromImpedance(complex(0.5, 0.2)))).toBe(true);
  });

  it('rejects NaN', () => {
    expect(() => reflectionFromImpedance(complex(NaN, 1))).toThrow(RangeError);
    expect(() => impedanceFromReflection(complex(0, NaN))).toThrow(RangeError);
  });
});

describe('inverse z = (1 + Γ)/(1 − Γ)', () => {
  it('maps the chart landmarks back', () => {
    expectComplexClose(impedanceFromReflection(ZERO), ONE);
    expectComplexClose(impedanceFromReflection(complex(-1, 0)), ZERO);
    expect(isInfinite(impedanceFromReflection(ONE))).toBe(true);
    expectComplexClose(impedanceFromReflection(COMPLEX_INFINITY), complex(-1, 0));
  });

  it('round-trips z → Γ → z across the chart', () => {
    const samples = [
      complex(1, 0), complex(2, 0), complex(0.5, 0), complex(1, 1), complex(0.2, -3),
      complex(0, 0.7), complex(10, 10), complex(0.01, 0.01), complex(100, -50), complex(3.3, 0.001),
    ];
    for (const z of samples) {
      expectComplexClose(impedanceFromReflection(reflectionFromImpedance(z)), z, 1e-10);
    }
  });

  it('round-trips Γ → z → Γ inside the disc', () => {
    for (let k = 0; k < 64; k++) {
      const angle = (k / 64) * 2 * Math.PI;
      const magnitude = (k % 8) / 8.5;
      const gamma = complex(magnitude * Math.cos(angle), magnitude * Math.sin(angle));
      expectComplexClose(reflectionFromImpedance(impedanceFromReflection(gamma)), gamma, 1e-12);
    }
  });

  it('round-trips open and short circuits exactly', () => {
    expect(isInfinite(impedanceFromReflection(reflectionFromImpedance(COMPLEX_INFINITY)))).toBe(true);
    expectComplexClose(impedanceFromReflection(reflectionFromImpedance(ZERO)), ZERO);
  });

  it('near the boundary, Γ close to +1 gives large but finite z', () => {
    const z = impedanceFromReflection(complex(1 - 1e-9, 0));
    expect(Number.isFinite(z.re)).toBe(true);
    expect(z.re).toBeCloseTo(2e9 - 1, -3);
  });
});
