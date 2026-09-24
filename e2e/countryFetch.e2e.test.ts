import { expect, it } from 'vitest';
import { createCountryFetch, type SearchResult } from '../src/index.ts';
import { expectAppItemsContract } from './contracts.ts';
import { liveClient, liveDescribe } from './helpers.ts';

const trackedFetch = (calls: string[], label: string): typeof fetch => {
  return (input, init) => {
    calls.push(label);
    return fetch(input, init);
  };
};

liveDescribe('createCountryFetch live contract', () => {
  it('routes app details through the matching country fetch', async () => {
    const calls: string[] = [];
    const fetchImpl = createCountryFetch({
      perCountry: { us: trackedFetch(calls, 'us') },
      fallback: trackedFetch(calls, 'fallback'),
    });

    const appId = 'com.google.android.apps.translate';
    const result = await liveClient.app({ appId, country: 'us', requestOptions: { fetchImpl } });

    expect(result.appId).toBe(appId);
    expect(result.title.length).toBeGreaterThan(0);
    expect(calls).toEqual(['us']);
  });

  it('routes search requests for an unmapped country to the fallback', async () => {
    const calls: string[] = [];
    const fetchImpl = createCountryFetch({
      perCountry: { us: trackedFetch(calls, 'us') },
      fallback: trackedFetch(calls, 'fallback'),
    });

    const results = (await liveClient.search({
      term: 'maps',
      country: 'de',
      num: 30,
      requestOptions: { fetchImpl },
    })) as SearchResult[];

    expect(results.length).toBeGreaterThan(0);
    expectAppItemsContract(results, 'fallback routed search');
    expect(calls.length).toBeGreaterThan(0);
    expect(new Set(calls)).toEqual(new Set(['fallback']));
  });
});
