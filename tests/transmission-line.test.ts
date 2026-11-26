import { describe, expect, it } from 'vitest';
import {
  COMPLEX_INFINITY,
  ONE,
  ZERO,
  abs,
  arg,
  complex,
  div,
  add,
  mul,
  electricalLength,
  electricalLengthBetween,
  electricalLengthDegrees,
  impedanceFromReflection,
  impedanceThroughLine,
  isInfinite,
  linePhasor,
  loadImpedanceFromInput,
  loadReflectionFromInput,
  nearestEquivalentLength,
  physicalLength,
  reflectionFromImpedance,
  reflectionThroughLine,
  vswrFromReflection,
  wavelengthFromFrequency,
} from '../src/core';
import { expectComplexClose } from './helpers';

const LOAD = complex(0.3, 0.4); // |Γ| = 0.5, angle ≈ 53.13°

describe('line phasor e^(−j4πd)', () => {
  it('is exact at multiples of λ/8', () => {
    expect(linePhasor(0)).toEqual(complex(1, 0));
    expect(linePhasor(0.125)).toEqual(complex(0, -1));
    expect(linePhasor(0.25)).toEqual(complex(-1, 0));
    expect(linePhasor(0.375)).toEqual(complex(0, 1));
    expect(linePhasor(0.5)).toEqual(complex(1, 0));
    expect(linePhasor(-0.125)).toEqual(complex(0, 1));
    expect(linePhasor(1000.25)).toEqual(complex(-1, 0));
  });

  it('has unit magnitude and the right angle elsewhere', () => {
    for (const d of [0.01, 0.0625, 0.2, 0.33, -0.17, 7.123]) {
      const p = linePhasor(d);
      expect(abs(p)).toBeCloseTo(1, 15);
      expectComplexClose(p, complex(Math.cos(-4 * Math.PI * d), Math.sin(-4 * Math.PI * d)), 1e-12);
    }
  });

  it('rejects non-finite lengths', () => {
    expect(() => linePhasor(NaN)).toThrow(RangeError);
    expect(() => linePhasor(Infinity)).toThrow(RangeError);
  });
});

describe('Γ through a lossless line', () => {
  it('0λ leaves Γ unchanged', () => {
    expect(reflectionThroughLine(LOAD, 0)).toEqual(LOAD);
  });

  it('λ/8 rotates Γ by −90°', () => {
    expectComplexClose(reflectionThroughLine(LOAD, 0.125), complex(0.4, -0.3));
  });

  it('λ/4 rotates Γ by −180°', () => {
    expectComplexClose(reflectionThroughLine(LOAD, 0.25), complex(-0.3, -0.4));
  });

  it('λ/2 completes one full revolution', () => {
    expectComplexClose(reflectionThroughLine(LOAD, 0.5), LOAD);
    expectComplexClose(reflectionThroughLine(LOAD, 3.5), LOAD);
  });

  it('positive length rotates clockwise (toward generator); negative counter-clockwise', () => {
    const cw = reflectionThroughLine(LOAD, 0.05);
    const ccw = reflectionThroughLine(LOAD, -0.05);
    const step = 4 * Math.PI * 0.05;
    expect(arg(cw)).toBeCloseTo(arg(LOAD) - step, 12);
    expect(arg(ccw)).toBeCloseTo(arg(LOAD) + step, 12);
  });

  it('preserves |Γ| and VSWR for any length', () => {
    for (const d of [0.01, 0.1, 0.2, 0.33, 0.49, 1.7, -0.3]) {
      const gamma = reflectionThroughLine(LOAD, d);
      expect(abs(gamma)).toBeCloseTo(abs(LOAD), 14);
      expect(vswrFromReflection(gamma)).toBeCloseTo(vswrFromReflection(LOAD), 12);
    }
  });

  it('forward then reverse is the identity', () => {
    for (const d of [0.07, 0.25, 0.41, 2.3, -0.6]) {
      expectComplexClose(loadReflectionFromInput(reflectionThroughLine(LOAD, d), d), LOAD, 1e-14);
      expectComplexClose(reflectionThroughLine(LOAD, d + -d), LOAD);
    }
  });

  it('composes additively: line(d1) then line(d2) = line(d1 + d2)', () => {
    expectComplexClose(reflectionThroughLine(reflectionThroughLine(LOAD, 0.07), 0.11), reflectionThroughLine(LOAD, 0.18), 1e-14);
  });

  it('matched load stays matched', () => {
    expect(reflectionThroughLine(ZERO, 0.17)).toEqual(ZERO);
  });
});

describe('z through a lossless line', () => {
  /** Closed form: z_in = (z_L + j tan βl) / (1 + j z_L tan βl). */
  function textbook(z: ReturnType<typeof complex>, d: number) {
    const t = Math.tan(2 * Math.PI * d);
    return div(add(z, complex(0, t)), add(ONE, mul(z, complex(0, t))));
  }

  it('agrees with the closed-form input-impedance formula', () => {
    for (const z of [complex(2, 0), complex(0.5, -1), complex(1, 1), complex(0.2, 3)]) {
      for (const d of [0.03, 0.1, 0.2, 0.3, 0.45]) {
        expectComplexClose(impedanceThroughLine(z, d), textbook(z, d), 1e-10);
      }
    }
  });

  it('is consistent with the Γ transformation', () => {
    const z = complex(0.7, -0.4);
    expectComplexClose(impedanceThroughLine(z, 0.13), impedanceFromReflection(reflectionThroughLine(reflectionFromImpedance(z), 0.13)));
  });

  it('quarter-wave transformer: z_in = 1/z_L', () => {
    expectComplexClose(impedanceThroughLine(complex(2, 0), 0.25), complex(0.5, 0));
    expectComplexClose(impedanceThroughLine(complex(1, 1), 0.25), complex(0.5, -0.5));
  });

  it('half-wave line repeats the load', () => {
    expectComplexClose(impedanceThroughLine(complex(0.3, 1.2), 0.5), complex(0.3, 1.2), 1e-12);
  });

  it('short ↔ open over λ/4, and short becomes pure reactance in between', () => {
    expect(isInfinite(impedanceThroughLine(ZERO, 0.25))).toBe(true);
    expectComplexClose(impedanceThroughLine(COMPLEX_INFINITY, 0.25), ZERO);
    // Shorted stub of λ/8: z_in = j tan(π/4) = j1.
    expectComplexClose(impedanceThroughLine(ZERO, 0.125), complex(0, 1));
  });

  it('reverse transformation round-trips', () => {
    const z = complex(1.8, -0.6);
    expectComplexClose(loadImpedanceFromInput(impedanceThroughLine(z, 0.31), 0.31), z, 1e-12);
  });
});

describe('lengths and wavelengths', () => {
  it('electrical length d = l/λ and back', () => {
    expect(electricalLength(0.25, 1)).toBe(0.25);
    expect(electricalLength(0.03, 0.12)).toBeCloseTo(0.25, 15);
    expect(physicalLength(0.25, 0.12)).toBeCloseTo(0.03, 15);
    expect(() => electricalLength(1, 0)).toThrow(RangeError);
    expect(() => electricalLength(NaN, 1)).toThrow(RangeError);
  });

  it('λ = v·c/f', () => {
    expect(wavelengthFromFrequency(299_792_458)).toBe(1);
    expect(wavelengthFromFrequency(1e9)).toBeCloseTo(0.299792458, 12);
    expect(wavelengthFromFrequency(1e9, 0.66)).toBeCloseTo(0.66 * 0.299792458, 12);
    expect(() => wavelengthFromFrequency(0)).toThrow(RangeError);
    expect(() => wavelengthFromFrequency(1e9, 1.2)).toThrow(RangeError);
    expect(() => wavelengthFromFrequency(1e9, 0)).toThrow(RangeError);
  });

  it('electrical length in degrees', () => {
    expect(electricalLengthDegrees(0.25)).toBe(90);
  });

  it('length between two Γ directions, toward the generator', () => {
    expect(electricalLengthBetween(LOAD, reflectionThroughLine(LOAD, 0.125))).toBeCloseTo(0.125, 14);
    expect(electricalLengthBetween(LOAD, reflectionThroughLine(LOAD, 0.4))).toBeCloseTo(0.4, 14);
    // A counter-clockwise step of 0.05λ is 0.45λ toward the generator.
    expect(electricalLengthBetween(LOAD, reflectionThroughLine(LOAD, -0.05))).toBeCloseTo(0.45, 14);
    expect(electricalLengthBetween(LOAD, LOAD)).toBe(0);
    expect(electricalLengthBetween(ZERO, LOAD)).toBeNull();
  });

  it('nearest equivalent length keeps continuity across the ½λ period', () => {
    expect(nearestEquivalentLength(0.02, 0.49)).toBeCloseTo(0.52, 14);
    expect(nearestEquivalentLength(0.48, 0.01)).toBeCloseTo(-0.02, 14);
    expect(nearestEquivalentLength(0.3, 0.3)).toBe(0.3);
    expect(nearestEquivalentLength(0.1, 2.05)).toBeCloseTo(2.1, 14);
  });
});
