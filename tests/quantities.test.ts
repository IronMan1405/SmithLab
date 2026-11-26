import { describe, expect, it } from 'vitest';
import { complex, reflectionFromImpedance } from '../src/core';
import { classifyLoad, clampToDisc, pointQuantities } from '../src/workspace';
import { expectComplexClose } from './helpers';

describe('quantities derived from a plotted Γ', () => {
  it('Γ = 0.2 + j0.4 gives z = 1 + j1 and all derived values', () => {
    const q = pointQuantities(complex(0.2, 0.4), 50);
    expect(q.kind).toBe('general');
    expectComplexClose(q.z, complex(1, 1));
    expectComplexClose(q.impedance, complex(50, 50));
    expectComplexClose(q.y, complex(0.5, -0.5));
    expect(q.gammaMagnitude).toBeCloseTo(1 / Math.sqrt(5), 14);
    expect(q.gammaPhaseDeg).toBeCloseTo((Math.atan2(0.4, 0.2) * 180) / Math.PI, 12);
    expect(q.vswr).toBeCloseTo((Math.sqrt(5) + 1) / (Math.sqrt(5) - 1), 12);
    expect(q.returnLossDb).toBeCloseTo(10 * Math.log10(5), 12);
  });

  it('physical impedance follows Z₀; normalised values do not', () => {
    const gamma = reflectionFromImpedance(complex(2, -0.5));
    const at50 = pointQuantities(gamma, 50);
    const at75 = pointQuantities(gamma, 75);
    expectComplexClose(at50.z, at75.z);
    expectComplexClose(at50.impedance, complex(100, -25), 1e-12);
    expectComplexClose(at75.impedance, complex(150, -37.5), 1e-12);
    expect(at75.vswr).toBe(at50.vswr);
  });

  it('matched load: VSWR 1, RL ∞, phase undefined', () => {
    const q = pointQuantities(complex(0, 0), 50);
    expect(q.kind).toBe('matched');
    expectComplexClose(q.impedance, complex(50, 0));
    expect(q.vswr).toBe(1);
    expect(q.returnLossDb).toBe(Infinity);
    expect(Number.isNaN(q.gammaPhaseDeg)).toBe(true);
  });

  it('short circuit: z = 0, y = ∞, VSWR ∞, RL 0 dB, phase 180°', () => {
    const q = pointQuantities(complex(-1, 0), 50);
    expect(q.kind).toBe('short');
    expect(q.z).toEqual(complex(0, 0));
    expect(Number.isFinite(q.y.re)).toBe(false);
    expect(q.vswr).toBe(Infinity);
    expect(q.returnLossDb).toBe(0);
    expect(q.gammaPhaseDeg).toBeCloseTo(180, 12);
  });

  it('open circuit: z = ∞, Z = ∞, y = 0', () => {
    const q = pointQuantities(complex(1, 0), 50);
    expect(q.kind).toBe('open');
    expect(Number.isFinite(q.z.re)).toBe(false);
    expect(Number.isFinite(q.impedance.re)).toBe(false);
    expect(q.y).toEqual(complex(0, 0));
    expect(q.vswr).toBe(Infinity);
  });

  it('points clamped to the boundary are exactly lossless (r = 0, |Γ| = 1)', () => {
    const gamma = clampToDisc(complex(0.3, 1.7));
    const q = pointQuantities(gamma, 50);
    expect(q.kind).toBe('lossless');
    expect(q.z.re).toBe(0);
    expect(q.y.re).toBe(0);
    expect(q.gammaMagnitude).toBe(1);
    expect(q.returnLossDb).toBe(0);
    expect(q.vswr).toBe(Infinity);
  });

  it('points just inside the boundary keep their small positive resistance', () => {
    const q = pointQuantities(complex(0, 1 - 1e-6), 50);
    expect(q.kind).toBe('general');
    expect(q.z.re).toBeGreaterThan(0);
    expect(Number.isFinite(q.vswr)).toBe(true);
  });

  it('classifies landmarks', () => {
    expect(classifyLoad(complex(0, 0))).toBe('matched');
    expect(classifyLoad(complex(-1, 0))).toBe('short');
    expect(classifyLoad(complex(1, 0))).toBe('open');
    expect(classifyLoad(complex(0, 1))).toBe('lossless');
    expect(classifyLoad(complex(0.1, 0.1))).toBe('general');
  });
});
