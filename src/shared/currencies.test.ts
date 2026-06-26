import { describe, expect, it } from 'vitest';
import { formatCurrencyAmount, normalizeCurrencyCode } from './currencies';

describe('currency helpers', () => {
  it('normalizes currency codes', () => {
    expect(normalizeCurrencyCode(' cny ')).toBe('CNY');
    expect(normalizeCurrencyCode('US')).toBeNull();
  });

  it('formats exchange amounts with grouping', () => {
    expect(formatCurrencyAmount(4913.52)).toBe('4,913.52');
    expect(formatCurrencyAmount(1000)).toBe('1,000');
  });
});
