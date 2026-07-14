import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from './client.js';
import { app } from './features/app/app.js';
import type { App } from './features/app/schema.js';
import { ValidationError } from './core/errors.js';

const readFixture = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../test/fixtures/${path}`, import.meta.url)), 'utf8');

const translateHtml = readFixture('app/translate.html');
const pandaHtml = readFixture('search/panda.html');
const reviewsInitial = readFixture('reviews/translate-initial.txt');

const TRANSLATE = 'com.google.android.apps.translate';

const respond = (body: string): Response => new Response(body, { status: 200 });

const urlOf = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const fetchReturning =
  (body: string): typeof fetch =>
  () =>
    Promise.resolve(respond(body));

interface TimedCall {
  ms: number;
  url: string;
}

const timingFetch = (calls: TimedCall[], start: number): typeof fetch => {
  return (input) => {
    const url = urlOf(input);
    calls.push({ ms: Date.now() - start, url });
    const body = url.includes('/store/apps/details') ? translateHtml : reviewsInitial;
    return Promise.resolve(respond(body));
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createClient', () => {
  it('shares one limiter across concurrent calls of the same method', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const calls: TimedCall[] = [];
    const fetchImpl = timingFetch(calls, start);
    const client = createClient({ throttle: 2, requestOptions: { fetchImpl } });

    const pending = Promise.all([
      client.app({ appId: TRANSLATE }),
      client.app({ appId: TRANSLATE }),
      client.app({ appId: TRANSLATE }),
      client.app({ appId: TRANSLATE }),
    ]);
    await vi.runAllTimersAsync();
    await pending;

    expect(calls.map((call) => call.ms).sort((a, b) => a - b)).toEqual([0, 0, 1000, 1000]);
  });

  it('shares the limiter across different methods of one client', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const calls: TimedCall[] = [];
    const fetchImpl = timingFetch(calls, start);
    const client = createClient({ throttle: 2, requestOptions: { fetchImpl } });

    const pending = Promise.all([
      client.app({ appId: TRANSLATE }),
      client.app({ appId: TRANSLATE }),
      client.reviews({ appId: TRANSLATE, paginate: true }),
      client.reviews({ appId: TRANSLATE, paginate: true }),
    ]);
    await vi.runAllTimersAsync();
    await pending;

    expect(calls.map((call) => call.ms).sort((a, b) => a - b)).toEqual([0, 0, 1000, 1000]);
  });

  it('applies client defaults, lets a per-call value win, and ignores explicit undefined', async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      urls.push(urlOf(input));
      return Promise.resolve(respond(translateHtml));
    };
    const client = createClient({ country: 'pl', lang: 'pl', requestOptions: { fetchImpl } });

    await client.app({ appId: TRANSLATE });
    expect(urls[0]).toContain('hl=pl');
    expect(urls[0]).toContain('gl=pl');

    await client.app({ appId: TRANSLATE, country: 'de' });
    expect(urls[1]).toContain('gl=de');
    expect(urls[1]).toContain('hl=pl');

    await client.app({ appId: TRANSLATE, country: undefined });
    expect(urls[2]).toContain('gl=pl');
  });

  it('merges client headers with a per-call signal and isolates aborts', async () => {
    const controller = new AbortController();
    const headersSeen: Record<string, string>[] = [];
    const fetchImpl: typeof fetch = (_input, init) => {
      headersSeen.push(init?.headers as Record<string, string>);
      const signal = init?.signal;
      return signal?.aborted
        ? Promise.reject(signal.reason as Error)
        : Promise.resolve(respond(translateHtml));
    };
    const client = createClient({
      requestOptions: { headers: { 'X-Client': 'yes' }, fetchImpl },
    });

    const ok = client.app({ appId: TRANSLATE });
    controller.abort();
    const aborted = client.app({
      appId: TRANSLATE,
      requestOptions: { signal: controller.signal },
    });

    await expect(ok).resolves.toBeDefined();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(headersSeen[0]?.['X-Client']).toBe('yes');
  });

  it('routes fullDetail app lookups through the same fetch and shared limiter', async () => {
    vi.useFakeTimers();
    const urls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      const url = urlOf(input);
      urls.push(url);
      const body = url.includes('/store/apps/details') ? translateHtml : pandaHtml;
      return Promise.resolve(respond(body));
    };
    const client = createClient({ throttle: 5, requestOptions: { fetchImpl } });

    const pending = client.search({ term: 'panda', num: 3, fullDetail: true });
    await vi.runAllTimersAsync();
    const results = (await pending) as App[];

    expect(results).toHaveLength(3);
    for (const item of results) {
      expect(item.title.length).toBeGreaterThan(0);
    }
    expect(urls.filter((url) => url.includes('/store/search'))).toHaveLength(1);
    expect(urls.filter((url) => url.includes('/store/apps/details'))).toHaveLength(3);
  });

  it('wires every method through the shared resolver and client defaults', async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      urls.push(urlOf(input));
      return Promise.resolve(respond(''));
    };
    const client = createClient({ lang: 'jp', country: 'jp', requestOptions: { fetchImpl } });

    const settle = (promise: Promise<unknown>): Promise<unknown> => promise.catch(() => undefined);

    await Promise.all([
      settle(client.suggest({ term: 'panda' })),
      settle(client.list({ num: 1 })),
      settle(client.developer({ devId: 'Adex77' })),
      settle(client.similar({ appId: TRANSLATE })),
      settle(client.permissions({ appId: TRANSLATE })),
      settle(client.datasafety({ appId: TRANSLATE })),
    ]);

    expect(urls).toHaveLength(6);
    for (const url of urls) {
      expect(url).toContain('jp');
    }

    const categoryIds = await client.categories();
    expect(categoryIds.length).toBeGreaterThan(0);
  });

  it('rejects invalid client options before any network work', () => {
    expect(() => createClient({ throttle: -1 })).toThrow(ValidationError);
    expect(() => createClient({ throttle: -1 })).toThrow(/^client:/);
  });

  it('leaves the top-level app function unchanged without the client factory', async () => {
    const result = await app({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(translateHtml) },
    });

    expect(result.appId).toBe(TRANSLATE);
    expect(result.title.length).toBeGreaterThan(0);
  });
});
