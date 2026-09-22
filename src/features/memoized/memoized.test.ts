import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoized } from './memoized.ts';
import { category } from '../../constants.ts';
import type { DegradationEvent } from '../../core/degradation.ts';
import { NotFoundError, ValidationError } from '../../core/errors.ts';
import type { RequestOptions } from '../../core/options.ts';
import type { App } from '../app/schema.ts';

const readFixture = (dir: string, name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/${dir}/${name}`, import.meta.url)),
    'utf8',
  );

const translateHtml = readFixture('app', 'translate.html');
const reviewsInitial = readFixture('reviews', 'translate-initial.txt');

const TRANSLATE_ID = 'com.google.android.apps.translate';

interface CountingFetch {
  fetchImpl: typeof fetch;
  state: { calls: number };
}

const countingAppFetch = (): CountingFetch => {
  const state = { calls: 0 };
  const fetchImpl: typeof fetch = () => {
    state.calls += 1;
    return Promise.resolve(new Response(translateHtml, { status: 200 }));
  };
  return { fetchImpl, state };
};

const requestOptionsFor = (fetchImpl: typeof fetch) => ({ fetchImpl });

const coreData = (id: string): unknown[] => {
  const core: unknown[] = [];
  core[0] = [id];
  core[1] = [null, null, null, [null, null, `https://icon.example/${id}`]];
  core[3] = `App ${id}`;
  core[4] = ['4.5', 4.5];
  core[8] = [null, [[0, 'USD']]];
  core[10] = [null, null, null, null, [null, null, `/store/apps/details?id=${id}`]];
  core[13] = [null, `Summary of ${id}`];
  core[14] = `Dev ${id}`;
  return core;
};

const searchPageHtml = (ids: string[], token: string): string => {
  const apps = ids.map((id) => [coreData(id)]);
  const section: unknown[] = [];
  section[22] = [apps, [null, null, null, [null, token]]];
  const ds4 = [[null, [section]]];
  const value = JSON.stringify(ds4);
  return `<script>AF_initDataCallback({key: 'ds:4', hash: '1', data:${value}, sideChannel: {}});</script>`;
};

const malformedClusterBatch = (): string => {
  const inner: unknown[] = [];
  inner[0] = [[42]];
  inner[7] = [null, null];
  const json = JSON.stringify([
    ['wrb.fr', 'qnKhOb', JSON.stringify([[inner]]), null, null, null, 'generic'],
  ]);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
};

const urlOf = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const recordingFetch = (
  bodyFor: (url: string) => string,
): { fetchImpl: typeof fetch; urls: string[] } => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = (input) => {
    const url = urlOf(input);
    urls.push(url);
    return Promise.resolve(new Response(bodyFor(url), { status: 200 }));
  };
  return { fetchImpl, urls };
};

const degradedSearchFetch = (): { fetchImpl: typeof fetch; urls: string[] } => {
  const firstPage = searchPageHtml(['a', 'b'], 'page-2-token');
  return recordingFetch((url) =>
    url.includes('/store/search') ? firstPage : malformedClusterBatch(),
  );
};

describe('memoized', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves identical app calls from cache and refetches a different appId', async () => {
    const client = memoized();
    const fetch = countingAppFetch();

    await client.app({ appId: 'com.a', requestOptions: requestOptionsFor(fetch.fetchImpl) });
    await client.app({ appId: 'com.a', requestOptions: requestOptionsFor(fetch.fetchImpl) });
    expect(fetch.state.calls).toBe(1);

    await client.app({ appId: 'com.b', requestOptions: requestOptionsFor(fetch.fetchImpl) });
    expect(fetch.state.calls).toBe(2);
  });

  it('refetches when a different fetch implementation is injected', async () => {
    const client = memoized();
    const first = countingAppFetch();
    const second = countingAppFetch();

    await client.app({ appId: 'com.a', requestOptions: requestOptionsFor(first.fetchImpl) });
    await client.app({ appId: 'com.a', requestOptions: requestOptionsFor(second.fetchImpl) });

    expect(first.state.calls).toBe(1);
    expect(second.state.calls).toBe(1);
  });

  it('keys entries by abort signal identity', async () => {
    const client = memoized();
    const fetch = countingAppFetch();
    const requestOptionsWith = (signal: AbortSignal): RequestOptions => ({
      fetchImpl: fetch.fetchImpl,
      signal,
    });
    const first = new AbortController();
    const second = new AbortController();

    await client.app({ appId: 'com.a', requestOptions: requestOptionsWith(first.signal) });
    await client.app({ appId: 'com.a', requestOptions: requestOptionsWith(first.signal) });
    expect(fetch.state.calls).toBe(1);

    await client.app({ appId: 'com.a', requestOptions: requestOptionsWith(second.signal) });
    expect(fetch.state.calls).toBe(2);
  });

  it('refetches after the entry expires past maxAgeMs', async () => {
    vi.useFakeTimers();
    const client = memoized({ maxAgeMs: 1000 });
    const fetch = countingAppFetch();

    await client.app({ appId: 'com.a', requestOptions: requestOptionsFor(fetch.fetchImpl) });
    expect(fetch.state.calls).toBe(1);

    await vi.advanceTimersByTimeAsync(1001);

    await client.app({ appId: 'com.a', requestOptions: requestOptionsFor(fetch.fetchImpl) });
    expect(fetch.state.calls).toBe(2);
  });

  it('does not cache a rejected call', async () => {
    const client = memoized();
    let attempts = 0;
    const fetchImpl: typeof fetch = () => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.resolve(new Response('missing', { status: 404 }));
      }
      return Promise.resolve(new Response(translateHtml, { status: 200 }));
    };

    await expect(
      client.app({ appId: 'com.a', requestOptions: requestOptionsFor(fetchImpl) }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const result = await client.app({
      appId: 'com.a',
      requestOptions: requestOptionsFor(fetchImpl),
    });
    expect(result.appId).toBe('com.a');
    expect(attempts).toBe(2);
  });

  it('reuses a warm app cache when a fullDetail search resolves the same appId', async () => {
    const searchPage = searchPageHtml([TRANSLATE_ID], 'next-token');
    let appFetches = 0;
    const fetchImpl: typeof fetch = (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/store/apps/details')) {
        appFetches += 1;
        return Promise.resolve(new Response(translateHtml, { status: 200 }));
      }
      return Promise.resolve(new Response(searchPage, { status: 200 }));
    };

    const client = memoized();

    await client.app({
      appId: TRANSLATE_ID,
      lang: 'en',
      country: 'us',
      requestOptions: requestOptionsFor(fetchImpl),
    });
    expect(appFetches).toBe(1);

    const detailed = (await client.search({
      term: 'translate',
      num: 1,
      fullDetail: true,
      requestOptions: requestOptionsFor(fetchImpl),
    })) as App[];

    expect(appFetches).toBe(1);
    expect(detailed).toHaveLength(1);
    expect(detailed[0]?.appId).toBe(TRANSLATE_ID);
  });

  it('evicts the oldest entry when max is exceeded', async () => {
    const client = memoized({ max: 1 });
    const fetch = countingAppFetch();

    await client.app({ appId: 'com.a', requestOptions: requestOptionsFor(fetch.fetchImpl) });
    await client.app({ appId: 'com.b', requestOptions: requestOptionsFor(fetch.fetchImpl) });
    await client.app({ appId: 'com.c', requestOptions: requestOptionsFor(fetch.fetchImpl) });
    expect(fetch.state.calls).toBe(3);

    await client.app({ appId: 'com.a', requestOptions: requestOptionsFor(fetch.fetchImpl) });
    expect(fetch.state.calls).toBe(4);
  });

  it('memoizes methods that take no options and exposes the constants', async () => {
    const client = memoized();

    const first = await client.categories();
    const second = await client.categories();
    expect(first).toEqual(second);
    expect(first).toContain(category.APPLICATION);

    expect(client.BASE_URL).toBe('https://play.google.com');
    expect(typeof client.reviews).toBe('function');
    expect(typeof client.dataSafety).toBe('function');
    expect(typeof client.permissions).toBe('function');
    expect(typeof client.developer).toBe('function');
    expect(typeof client.similar).toBe('function');
    expect(typeof client.suggest).toBe('function');
    expect(typeof client.list).toBe('function');
  });

  it('applies constructor language and country defaults and lets a per-call value win', async () => {
    const fetch = recordingFetch(() => translateHtml);
    const client = memoized({
      lang: 'pl',
      country: 'pl',
      requestOptions: { fetchImpl: fetch.fetchImpl },
    });

    await client.app({ appId: 'com.a' });
    await client.app({ appId: 'com.a', country: 'de' });

    expect(fetch.urls[0]).toContain('hl=pl');
    expect(fetch.urls[0]).toContain('gl=pl');
    expect(fetch.urls[1]).toContain('hl=pl');
    expect(fetch.urls[1]).toContain('gl=de');
  });

  it('applies the constructor defaults to the uncached iterators', async () => {
    const fetch = recordingFetch(() => reviewsInitial);
    const client = memoized({
      lang: 'pl',
      country: 'pl',
      requestOptions: { fetchImpl: fetch.fetchImpl },
    });

    const first = await client.reviewsIterator({ appId: 'com.a' }).next();
    await client.reviewsIterator({ appId: 'com.a' }).next();

    expect(first.done).toBe(false);
    expect(fetch.urls).toHaveLength(2);
    expect(fetch.urls[0]).toContain('hl=pl');
    expect(fetch.urls[0]).toContain('gl=pl');
  });

  it('treats omitted defaults, country casing, and property order as one entry', async () => {
    const client = memoized();
    const fetch = countingAppFetch();
    const requestOptions = requestOptionsFor(fetch.fetchImpl);

    await client.app({ appId: 'com.a', requestOptions });
    await client.app({ appId: 'com.a', lang: 'en', country: 'us', requestOptions });
    await client.app({ requestOptions, country: 'US', appId: 'com.a' });
    await client.app({ appId: 'com.a', requestOptions, country: undefined });

    expect(fetch.state.calls).toBe(1);
    expect(client.cache.size).toBe(1);
  });

  it('never fragments the cache on callbacks or lifecycle hooks and skips hooks on a hit', async () => {
    const client = memoized();
    const fetch = countingAppFetch();
    const requests: number[] = [];
    const requestOptionsWith = (onRequest: () => void): RequestOptions => ({
      fetchImpl: fetch.fetchImpl,
      onRequest,
    });

    await client.app({
      appId: 'com.a',
      throttle: 5,
      onIntegrityEvent: () => undefined,
      requestOptions: requestOptionsWith(() => {
        requests.push(1);
      }),
    });
    await client.app({
      appId: 'com.a',
      onDegradation: () => undefined,
      requestOptions: requestOptionsWith(() => {
        requests.push(2);
      }),
    });

    expect(fetch.state.calls).toBe(1);
    expect(requests).toEqual([1]);
  });

  it('replays degradation events on a cache hit across a callback boundary', async () => {
    const fetch = degradedSearchFetch();
    const client = memoized({ requestOptions: { fetchImpl: fetch.fetchImpl } });

    const warmed = await client.search({ term: 'panda', num: 5 });
    const events: DegradationEvent[] = [];
    const hit = await client.search({
      term: 'panda',
      num: 5,
      onDegradation: (event) => events.push(event),
    });

    expect(hit).toEqual(warmed);
    expect(fetch.urls).toHaveLength(2);
    expect(events).toHaveLength(1);
    expect(events[0]?.context).toBe('search');
    expect(events[0]?.reason).toBe('cluster-page-parse');
  });

  it('applies a constructor degradation callback to misses and hits alike', async () => {
    const fetch = degradedSearchFetch();
    const contexts: string[] = [];
    const client = memoized({
      requestOptions: { fetchImpl: fetch.fetchImpl },
      onDegradation: (event) => contexts.push(event.context),
    });

    await client.search({ term: 'panda', num: 5 });
    await client.search({ term: 'panda', num: 5 });

    expect(fetch.urls).toHaveLength(2);
    expect(contexts).toEqual(['search', 'search']);
  });

  it('shares one limiter across direct, batch, iterator, and cache-miss requests', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const timings: number[] = [];
    const fetchImpl: typeof fetch = (input) => {
      timings.push(Date.now() - start);
      const body = urlOf(input).includes('/store/apps/details') ? translateHtml : reviewsInitial;
      return Promise.resolve(new Response(body, { status: 200 }));
    };
    const client = memoized({ throttle: 2, requestOptions: { fetchImpl } });

    const pending = Promise.all([
      client.app({ appId: 'com.a' }),
      client.apps({ appIds: ['com.b', 'com.c'] }),
      client.reviewsIterator({ appId: 'com.a' }).next(),
    ]);
    await vi.runAllTimersAsync();
    await pending;

    expect(timings.sort((a, b) => a - b)).toEqual([0, 0, 1000, 1000]);
  });

  it('serves batch lookups from warm app entries', async () => {
    const client = memoized();
    const fetch = countingAppFetch();
    const requestOptions = requestOptionsFor(fetch.fetchImpl);

    await client.app({ appId: 'com.a', requestOptions });
    const entries = await client.apps({ appIds: ['com.a', 'com.b'], requestOptions });
    await client.app({ appId: 'com.b', requestOptions });

    expect(entries.map((entry) => entry.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(fetch.state.calls).toBe(2);
  });

  it('exposes size, targeted invalidation, and clearing', async () => {
    const client = memoized({ country: 'pl' });
    const fetch = countingAppFetch();
    const requestOptions = requestOptionsFor(fetch.fetchImpl);

    await client.app({ appId: 'com.a', requestOptions });
    await client.app({ appId: 'com.b', requestOptions });
    expect(client.cache.size).toBe(2);

    expect(client.cache.invalidate('app', { appId: 'com.a', requestOptions })).toBe(true);
    expect(client.cache.invalidate('app', { appId: 'com.a', requestOptions })).toBe(false);
    expect(client.cache.size).toBe(1);

    await client.app({ appId: 'com.a', requestOptions });
    await client.app({ appId: 'com.b', requestOptions });
    expect(fetch.state.calls).toBe(3);

    await client.categories();
    expect(client.cache.invalidate('categories')).toBe(true);
    expect(client.cache.invalidate('categories', {})).toBe(false);

    client.cache.clear();
    expect(client.cache.size).toBe(0);
    await client.app({ appId: 'com.b', requestOptions });
    expect(fetch.state.calls).toBe(4);
  });

  it('rejects invalid options before creating any cache or HTTP state', () => {
    expect(() => memoized({ max: 0 })).toThrow(ValidationError);
    expect(() => memoized({ max: 0 })).toThrow(/^memoized:/);
    expect(() => memoized({ maxAgeMs: 1.5 })).toThrow(ValidationError);
    expect(() => memoized({ maxAgeMs: 2_147_483_648 })).toThrow(ValidationError);
    expect(() => memoized({ throttle: -1 })).toThrow(ValidationError);
    expect(() => memoized({ onDegradation: 'log' as never })).toThrow(ValidationError);
    expect(() => memoized({ country: 'usa' })).toThrow(ValidationError);
  });
});
