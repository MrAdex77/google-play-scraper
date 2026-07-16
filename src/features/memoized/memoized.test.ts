import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoized } from './memoized.js';
import { category } from '../../constants.js';
import { NotFoundError } from '../../core/errors.js';
import type { RequestOptions } from '../../core/options.js';
import type { App } from '../app/schema.js';

const readFixture = (dir: string, name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/${dir}/${name}`, import.meta.url)),
    'utf8',
  );

const translateHtml = readFixture('app', 'translate.html');

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

  it('keys entries by lifecycle hook identity', async () => {
    const client = memoized();
    const fetch = countingAppFetch();
    const stableHook = (): void => undefined;
    const requestOptionsWith = (onRequest: () => void): RequestOptions => ({
      fetchImpl: fetch.fetchImpl,
      onRequest,
    });

    await client.app({ appId: 'com.a', requestOptions: requestOptionsWith(stableHook) });
    await client.app({ appId: 'com.a', requestOptions: requestOptionsWith(stableHook) });
    expect(fetch.state.calls).toBe(1);

    await client.app({ appId: 'com.a', requestOptions: requestOptionsWith((): void => undefined) });
    expect(fetch.state.calls).toBe(2);
  });

  it('memoizes methods that take no options and exposes the constants', async () => {
    const client = memoized();

    const first = await client.categories();
    const second = await client.categories();
    expect(first).toEqual(second);
    expect(first).toContain(category.APPLICATION);

    expect(client.BASE_URL).toBe('https://play.google.com');
    expect(typeof client.reviews).toBe('function');
    expect(typeof client.datasafety).toBe('function');
    expect(typeof client.permissions).toBe('function');
    expect(typeof client.developer).toBe('function');
    expect(typeof client.similar).toBe('function');
    expect(typeof client.suggest).toBe('function');
    expect(typeof client.list).toBe('function');
  });
});
