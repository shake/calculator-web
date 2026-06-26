import { fetchYahooFxRate } from './_lib/yahoo-fx';
import { normalizeCurrencyCode } from '../src/shared/currencies';

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: {
      'cache-control': 'no-store',
    },
    ...init,
  });
}

function buildCacheRequest(url: URL) {
  const cacheUrl = new URL(url.toString());
  cacheUrl.searchParams.sort();
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

export async function onRequestGet({ request }: { request: Request }) {
  const url = new URL(request.url);
  const fromCurrency = normalizeCurrencyCode(url.searchParams.get('from'));
  const toCurrency = normalizeCurrencyCode(url.searchParams.get('to'));

  if (!fromCurrency || !toCurrency) {
    return json({
      error: 'Invalid currency pair',
      message: 'Query parameters "from" and "to" must be 3-letter currency codes.',
    }, { status: 400 });
  }

  if (fromCurrency === toCurrency) {
    return json({
      fromCurrency,
      toCurrency,
      rate: 1,
      symbol: `${fromCurrency}${toCurrency}=X`,
      lastRefreshed: new Date().toISOString(),
      source: 'identity',
    }, {
      headers: {
        'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400',
      },
    });
  }

  const cache = caches.default;
  const cacheRequest = buildCacheRequest(url);
  const cachedResponse = await cache.match(cacheRequest);

  if (cachedResponse) {
    return cachedResponse;
  }

  const payload = await fetchYahooFxRate(fromCurrency, toCurrency);

  const response = json(payload, {
    headers: {
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400',
    },
  });

  await cache.put(cacheRequest, response.clone());

  return response;
}
