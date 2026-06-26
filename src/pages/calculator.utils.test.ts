import { describe, expect, it } from 'vitest';
import { evaluateExpression, formatDisplayNumber, percentExpression, toggleSignExpression } from './calculator.utils';

describe('calculator utils', () => {
  it('evaluates basic arithmetic', () => {
    expect(evaluateExpression('1+2×3', 'rad')).toBe(7);
    expect(evaluateExpression('10÷2−1', 'rad')).toBe(4);
  });

  it('evaluates scientific functions', () => {
    expect(formatDisplayNumber(evaluateExpression('sin(30)', 'deg'))).toBe('0.5');
    expect(formatDisplayNumber(evaluateExpression('sqrt(9)+fact(4)', 'rad'))).toBe('27');
  });

  it('handles percent and sign toggles', () => {
    expect(percentExpression('50')).toBe('(50/100)');
    expect(toggleSignExpression('42')).toBe('(-42)');
  });
});
