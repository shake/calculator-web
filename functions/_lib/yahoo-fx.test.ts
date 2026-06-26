import { describe, expect, it } from 'vitest';
import { parseYahooFxRatePayload } from './yahoo-fx';

describe('parseYahooFxRatePayload', () => {
  it('reads the current price from the Yahoo chart meta payload', () => {
    const result = parseYahooFxRatePayload({
      chart: {
        result: [
          {
            meta: {
              regularMarketPrice: 6.8006,
              regularMarketTime: 1782457650,
            },
          },
        ],
      },
    }, 'USD', 'CNY');

    expect(result).toMatchObject({
      fromCurrency: 'USD',
      toCurrency: 'CNY',
      rate: 6.8006,
      symbol: 'USDCNY=X',
      source: 'yahoo-finance',
    });
    expect(result.lastRefreshed).toBe('2026-06-26T07:07:30.000Z');
  });

  it('falls back to the latest close when meta price is missing', () => {
    const result = parseYahooFxRatePayload({
      chart: {
        result: [
          {
            meta: {
              regularMarketTime: 1782457650,
            },
            indicators: {
              quote: [
                {
                  close: [null, 1.2, 1.25],
                },
              ],
            },
          },
        ],
      },
    }, 'EUR', 'USD');

    expect(result.rate).toBe(1.25);
    expect(result.symbol).toBe('EURUSD=X');
  });
});
