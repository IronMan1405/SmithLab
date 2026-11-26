import { describe, expect, it } from 'vitest';
import {
  ONE,
  ZERO,
  complex,
  reflectionFromImpedance,
  reflectionMagnitudeFromVswr,
  returnLossDb,
  returnLossFromReflectionMagnitude,
  vswrFromReflection,
  vswrFromReflectionMagnitude,
} from '../src/core';

describe('VSWR', () => {
  it('is 1 for a matched load', () => {
    expect(vswrFromReflection(ZERO)).toBe(1);
  });

  it('is 2 for z = 2 (|Γ| = 1/3) and for z = 0.5', () => {
    expect(vswrFromReflection(reflectionFromImpedance(complex(2, 0)))).toBeCloseTo(2, 12);
    expect(vswrFromReflection(reflectionFromImpedance(complex(0.5, 0)))).toBeCloseTo(2, 12);
  });

  it('equals r for a real load r > 1', () => {
    for (const r of [1.5, 3, 10]) {
      expect(vswrFromReflection(reflectionFromImpedance(complex(r, 0)))).toBeCloseTo(r, 10);
    }
  });

  it('for z = 1 + j1, |Γ| = 1/√5 gives VSWR = (√5 + 1)/(√5 − 1) ≈ 2.618', () => {
    const expected = (Math.sqrt(5) + 1) / (Math.sqrt(5) - 1);
    expect(vswrFromReflection(reflectionFromImpedance(complex(1, 1)))).toBeCloseTo(expected, 12);
  });

  it('is ∞ for open, short and pure-reactance loads', () => {
    expect(vswrFromReflection(ONE)).toBe(Infinity);
    expect(vswrFromReflection(complex(-1, 0))).toBe(Infinity);
    expect(vswrFromReflection(reflectionFromImpedance(complex(0, 0.7)))).toBe(Infinity);
  });

  it('is large but finite just inside the boundary', () => {
    const vswr = vswrFromReflectionMagnitude(1 - 1e-6);
    expect(Number.isFinite(vswr)).toBe(true);
    expect(vswr).toBeCloseTo(2e6 - 1, -1);
  });

  it('throws for active loads (|Γ| > 1) and invalid magnitudes', () => {
    expect(() => vswrFromReflectionMagnitude(1.5)).toThrow(RangeError);
    expect(() => vswrFromReflection(reflectionFromImpedance(complex(-0.5, 0)))).toThrow(RangeError);
    expect(() => vswrFromReflectionMagnitude(-0.1)).toThrow(RangeError);
    expect(() => vswrFromReflectionMagnitude(NaN)).toThrow(RangeError);
  });

  it('inverts to |Γ|', () => {
    expect(reflectionMagnitudeFromVswr(1)).toBe(0);
    expect(reflectionMagnitudeFromVswr(2)).toBeCloseTo(1 / 3, 15);
    expect(reflectionMagnitudeFromVswr(Infinity)).toBe(1);
    expect(vswrFromReflectionMagnitude(reflectionMagnitudeFromVswr(3.7))).toBeCloseTo(3.7, 12);
    expect(() => reflectionMagnitudeFromVswr(0.5)).toThrow(RangeError);
  });
});

describe('return loss RL = −20 log₁₀|Γ|', () => {
  it('is +∞ dB for a matched load (Γ = 0)', () => {
    expect(returnLossDb(ZERO)).toBe(Infinity);
  });

  it('is 0 dB for total reflection', () => {
    expect(returnLossDb(ONE)).toBeCloseTo(0, 15);
    expect(returnLossDb(complex(-1, 0))).toBeCloseTo(0, 15);
  });

  it('matches known values for mismatched loads', () => {
    // z = 2: |Γ| = 1/3 → RL = 20 log₁₀ 3 ≈ 9.5424 dB
    expect(returnLossDb(reflectionFromImpedance(complex(2, 0)))).toBeCloseTo(20 * Math.log10(3), 12);
    expect(returnLossFromReflectionMagnitude(0.1)).toBeCloseTo(20, 12);
    expect(returnLossFromReflectionMagnitude(0.5)).toBeCloseTo(6.0206, 4);
  });

  it('is negative for active loads (|Γ| > 1) rather than hidden', () => {
    expect(returnLossFromReflectionMagnitude(2)).toBeCloseTo(-6.0206, 4);
  });

  it('rejects invalid magnitudes', () => {
    expect(() => returnLossFromReflectionMagnitude(-1)).toThrow(RangeError);
    expect(() => returnLossDb(complex(NaN, 0))).toThrow(RangeError);
  });
});
