export interface YahooFxRateResult {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  symbol: string;
  lastRefreshed: string;
  source: 'yahoo-finance';
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        regularMarketTime?: number;
        symbol?: string;
      };
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    };
  };
}

function getLastNumericValue(values: Array<number | null> | undefined) {
  if (!values || values.length === 0) {
    return null;
  }

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

export function parseYahooFxRatePayload(payload: YahooChartResponse, fromCurrency: string, toCurrency: string): YahooFxRateResult {
  const result = payload.chart?.result?.[0];
  const rate = result?.meta?.regularMarketPrice ?? getLastNumericValue(result?.indicators?.quote?.[0]?.close);

  if (typeof rate !== 'number' || !Number.isFinite(rate)) {
    throw new Error(payload.chart?.error?.description ?? 'Yahoo FX response did not include a usable rate');
  }

  const lastRefreshed = result?.meta?.regularMarketTime
    ? new Date(result.meta.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();

  return {
    fromCurrency,
    toCurrency,
    rate,
    symbol: `${fromCurrency}${toCurrency}=X`,
    lastRefreshed,
    source: 'yahoo-finance',
  };
}

export async function fetchYahooFxRate(fromCurrency: string, toCurrency: string, fetchImpl: typeof fetch = fetch) {
  const symbol = `${fromCurrency}${toCurrency}=X`;
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.searchParams.set('interval', '1d');
  url.searchParams.set('range', '1d');

  const response = await fetchImpl(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo FX request failed with status ${response.status}`);
  }

  const payload = await response.json() as YahooChartResponse;
  return parseYahooFxRatePayload(payload, fromCurrency, toCurrency);
}
