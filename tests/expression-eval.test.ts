import { describe, expect, it } from 'vitest';
import { abs, complex, impedanceThroughLine, reflectionFromImpedance, vswrFromReflection } from '../src/core';
import {
  type ExpressionDef,
  type ExpressionResult,
  createExpressionDef,
  declaredTypeForName,
  evaluateExpressions,
} from '../src/expressions';
import { expectComplexClose } from './helpers';

let counter = 0;
function defs(...lines: string[]): ExpressionDef[] {
  return lines.map((text) => createExpressionDef(`e${++counter}`, text));
}

/** Evaluate lines and return the result of the last one. */
function last(...lines: string[]): ExpressionResult {
  const output = evaluateExpressions(defs(...lines), 50);
  return [...output.results.values()].at(-1)!;
}

function value(...lines: string[]) {
  const r = last(...lines);
  if (r.status !== 'ok' || !r.value) throw new Error(`${r.status}: ${r.error?.message}`);
  return r.value;
}

function errorOf(...lines: string[]) {
  const r = last(...lines);
  expect(r.status).toBe('error');
  return r.error!;
}

describe('complex arithmetic', () => {
  it('evaluates numbers, j and arithmetic', () => {
    expect(value('1 + 2 * 3').value).toEqual(complex(7, 0));
    expectComplexClose(value('(1 + j2) * (3 - j)').value, complex(5, 5));
    expectComplexClose(value('(1 + j1) / (1 - j1)').value, complex(0, 1));
    expectComplexClose(value('j*j').value, complex(-1, 0));
    expectComplexClose(value('2j + 0.5').value, complex(0.5, 2));
    expectComplexClose(value('2^10').value, complex(1024, 0));
    expectComplexClose(value('(1 + j)^2').value, complex(0, 2));
    expectComplexClose(value('(-1)^0.5').value, complex(0, 1), 1e-12);
  });

  it('evaluates functions and constants', () => {
    expectComplexClose(value('exp(j*pi)').value, complex(-1, 0), 1e-12);
    expectComplexClose(value('sqrt(-4)').value, complex(0, 2));
    expect(value('abs(3 + j4)').value.re).toBe(5);
    expect(value('deg(arg(j))').value.re).toBeCloseTo(90, 12);
    expect(value('re(2 - j3)').value.re).toBe(2);
    expect(value('im(2 - j3)').value.re).toBe(-3);
    expectComplexClose(value('conj(2 - j3)').value, complex(2, 3));
    expectComplexClose(value('polar(2, pi/2)').value, complex(0, 2), 1e-12);
    expectComplexClose(value('cos(0) + sin(0) + tan(0) + ln(1)').value, complex(1, 0));
  });

  it('distinguishes real from complex results', () => {
    expect(value('2 * 3').type).toBe('real');
    expect(value('1 + j').type).toBe('complex');
    expect(value('j * j').type).toBe('complex'); // value is real, but it came from complex operands
    expect(value('sqrt(4)').type).toBe('real');
    expect(value('sqrt(-4)').type).toBe('complex');
    expect(value('abs(1 + j)').type).toBe('real');
  });

  it('reports indeterminate forms and division by zero', () => {
    expect(errorOf('0/0').kind).toBe('math');
    const inf = value('1/0');
    expect(Number.isFinite(inf.value.re)).toBe(false);
  });

  it('reports unknown functions and wrong argument counts', () => {
    expect(errorOf('foo(1)')).toMatchObject({ kind: 'reference', message: expect.stringMatching(/Unknown function/) });
    expect(errorOf('exp(1, 2)').message).toMatch(/takes 1 argument/);
  });
});

describe('RF types', () => {
  it('declares types from names', () => {
    expect(declaredTypeForName('zL')).toBe('impedance');
    expect(declaredTypeForName('z')).toBe('impedance');
    expect(declaredTypeForName('z_in')).toBe('impedance');
    expect(declaredTypeForName('zeta')).toBeNull();
    expect(declaredTypeForName('yL')).toBe('admittance');
    expect(declaredTypeForName('ZL')).toBe('physicalImpedance');
    expect(declaredTypeForName('gammaIn')).toBe('reflection');
    expect(declaredTypeForName('Γin')).toBe('reflection');
    expect(declaredTypeForName('l')).toBe('length');
    expect(declaredTypeForName('l2')).toBe('length');
    expect(declaredTypeForName('loss')).toBeNull();
    expect(declaredTypeForName('k')).toBeNull();
  });

  it('runs the brief example with the right types and values', () => {
    const output = evaluateExpressions(
      defs('zL = 0.5 + j1.2', 'yL = 1/zL', 'gammaL = (zL - 1)/(zL + 1)', 'l = 0.125', 'gammaIn = gammaL * exp(-j*4*pi*l)'),
      50,
    );
    const [zL, yL, gL, l, gIn] = [...output.results.values()];
    expect(zL!.value).toEqual({ type: 'impedance', value: complex(0.5, 1.2) });
    expect(yL!.value!.type).toBe('admittance');
    expectComplexClose(yL!.value!.value, complex(0.5 / 1.69, -1.2 / 1.69));
    expect(gL!.value!.type).toBe('reflection');
    expectComplexClose(gL!.value!.value, reflectionFromImpedance(complex(0.5, 1.2)));
    expect(l!.value).toEqual({ type: 'length', value: complex(0.125, 0) });
    expect(gIn!.value!.type).toBe('reflection');
    // λ/8 rotates Γ by −90°.
    const g = gL!.value!.value;
    expectComplexClose(gIn!.value!.value, complex(g.im, -g.re), 1e-12);
  });

  it('operator rules preserve meaning', () => {
    expect(value('zL = 1 + j', 'zL - 1').type).toBe('impedance');
    expect(value('zL = 1 + j', 'zL * 2').type).toBe('impedance');
    expect(value('zL = 1 + j', '1/zL').type).toBe('admittance');
    expect(value('yL = 1 + j', '1/yL').type).toBe('impedance');
    expect(value('zL = 1 + j', 'zL/zL').type).toBe('complex');
    expect(value('zA = 1 + j', 'zB = 2', 'zA + zB').type).toBe('impedance'); // series combination
    expect(value('gammaL = 0.5', 'gammaL * exp(-j*pi)').type).toBe('reflection');
    expect(value('l = 0.1', 'l * 2').type).toBe('real'); // a multiple of a length is a plain number…
    expect(value('l = 0.1', 'l2 = l * 2').type).toBe('length'); // …until named l…
    expect(value('l = 0.1', '-4*pi*l').type).toBe('real'); // e.g. an angle for rotate()
    expect(value('l = 0.1', '-j*4*pi*l').type).toBe('complex');
    expect(value('ZL = 100', 'ZL / 2').type).toBe('physicalImpedance');
  });

  it('rejects meaningless combinations', () => {
    expect(errorOf('zL = 1 + j', 'yL = 1', 'zL + yL')).toMatchObject({ kind: 'type', message: expect.stringMatching(/Cannot add a normalized impedance and a normalized admittance/) });
    expect(errorOf('ZL = 50', 'ZL + 1').message).toMatch(/dimensionless number to a physical impedance/);
    expect(errorOf('l = 0.1', 'l + j').message).toMatch(/complex number to an electrical length/);
    expect(errorOf('zL = 1', 'exp(zL)').message).toMatch(/exp\(\) expects a plain number/);
    expect(errorOf('l = 0.1', 'l * l').message).toMatch(/Cannot multiply an electrical length/);
    expect(errorOf('zL = 1', '2^zL').message).toMatch(/exponent must be a plain number/i);
    expect(errorOf('l = 1 + j').message).toMatch(/must be a real number of wavelengths/);
  });

  it('rejects a name that contradicts a typed value, suggesting a conversion', () => {
    const e = errorOf('zL = 2', 'gammaX = zL');
    expect(e.kind).toBe('type');
    expect(e.message).toMatch(/named like a reflection coefficient, but the expression is a normalized impedance.*gamma\(…\)/);
    // Explicit conversion works.
    expectComplexClose(value('zL = 2', 'gammaX = gamma(zL)').value, complex(1 / 3, 0));
  });
});

describe('RF functions', () => {
  it('converts between z, y, Γ and Z using Z₀', () => {
    expectComplexClose(value('gamma(z(2))').value, complex(1 / 3, 0));
    expectComplexClose(value('z(gamma(1/3))').value, complex(2, 0), 1e-12);
    expectComplexClose(value('y(z(2))').value, complex(0.5, 0));
    expectComplexClose(value('z(y(0.5))').value, complex(2, 0));
    expectComplexClose(value('Z(z(2))').value, complex(100, 0)); // Z₀ = 50
    expectComplexClose(value('z(Z(25 + j50))').value, complex(0.5, 1));
    expectComplexClose(value('y(Z(100))').value, complex(0.5, 0));
    expect(value('z(1 + j)').type).toBe('impedance'); // declaration of a plain number
  });

  it('measures VSWR and return loss', () => {
    expect(value('vswr(z(2))').value.re).toBeCloseTo(2, 12);
    expect(value('vswr(gamma(0))').value.re).toBe(1);
    expect(value('rl(z(2))').value.re).toBeCloseTo(20 * Math.log10(3), 12);
    expect(errorOf('vswr(0.5)').message).toMatch(/needs an impedance, admittance or reflection/);
  });

  it('line() transforms through a lossless line and keeps the type', () => {
    const zIn = value('zL = 0.5 + j1.2', 'zIn = line(zL, 0.1)');
    expect(zIn.type).toBe('impedance');
    expectComplexClose(zIn.value, impedanceThroughLine(complex(0.5, 1.2), 0.1), 1e-12);
    expectComplexClose(value('line(z(2), 0.25)').value, complex(0.5, 0), 1e-12);
    expect(value('line(y(2), 0.25)').type).toBe('admittance');
    expect(errorOf('line(z(2), j)').message).toMatch(/real number of wavelengths/);
    const g = value('line(gamma(0.5), 0.3)').value;
    expect(abs(g)).toBeCloseTo(0.5, 14);
    expect(vswrFromReflection(g)).toBeCloseTo(3, 12);
  });
});
