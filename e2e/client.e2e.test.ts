import { expect, it } from 'vitest';
import { createClient, memoized, type SearchResult } from '../src/index.js';
import { liveClient, liveDescribe } from './helpers.js';

const TRANSLATE = 'com.google.android.apps.translate';
const QUEUE_DEPTH = 4;
const THROTTLE_WINDOW_MS = 1000;
const ABORT_AFTER_MS = 200;

liveDescribe('createClient live contract', () => {
  it('runs app and search through one shared client', async () => {
    const details = await liveClient.app({ appId: TRANSLATE });
    expect(details.appId).toBe(TRANSLATE);
    expect(details.title.length).toBeGreaterThan(0);

    const results = (await liveClient.search({ term: 'where am i', num: 5 })) as SearchResult[];
    expect(results.length).toBeGreaterThan(0);
    for (const item of results) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(new URL(item.url).origin).toBe('https://play.google.com');
    }
  });

  it('applies the client country default to app requests', async () => {
    const client = createClient({ country: 'pl', throttle: 1 });
    const details = await client.app({ appId: TRANSLATE });

    expect(details.appId).toBe(TRANSLATE);
    expect(details.url).toContain('gl=pl');
  });
});

liveDescribe('memoized live contract', () => {
  it('serves an equivalent app call from cache and honors targeted invalidation', async () => {
    const requested: string[] = [];
    const client = memoized({
      country: 'pl',
      lang: 'pl',
      throttle: 1,
      requestOptions: {
        onRequest: (event) => {
          requested.push(event.url);
        },
      },
    });

    const warmed = await client.app({ appId: TRANSLATE });
    const hit = await client.app({ appId: TRANSLATE, country: 'PL', lang: 'pl' });

    expect(warmed.url).toContain('gl=pl');
    expect(warmed.url).toContain('hl=pl');
    expect(hit).toBe(warmed);
    expect(requested).toHaveLength(1);
    expect(client.cache.size).toBe(1);

    expect(client.cache.invalidate('app', { appId: TRANSLATE })).toBe(true);
    const refreshed = await client.app({ appId: TRANSLATE });
    expect(refreshed.appId).toBe(TRANSLATE);
    expect(requested).toHaveLength(2);
  });
});

liveDescribe('cancellation live contract', () => {
  it('releases requests queued behind the shared limiter as soon as the caller aborts', async () => {
    const controller = new AbortController();
    const reason = { code: 'live-abort' };
    const client = createClient({
      throttle: 1,
      requestOptions: { signal: controller.signal },
    });

    const startedAt = Date.now();
    const pending = Array.from({ length: QUEUE_DEPTH }, () =>
      client.app({ appId: TRANSLATE }).catch((error: unknown) => error),
    );
    setTimeout(() => {
      controller.abort(reason);
    }, ABORT_AFTER_MS);
    const settled = await Promise.all(pending);
    const elapsedMs = Date.now() - startedAt;

    expect(
      elapsedMs,
      'queued requests were not released before the first throttle window closed',
    ).toBeLessThan(THROTTLE_WINDOW_MS);
    const aborted = settled.filter((value) => value === reason);
    expect(aborted.length).toBeGreaterThanOrEqual(QUEUE_DEPTH - 1);
    for (const value of settled.filter((entry) => entry !== reason)) {
      expect(value).toMatchObject({ appId: TRANSLATE });
    }
  });

  it('stops a paginating walk at the abort instead of finishing the page budget', async () => {
    const controller = new AbortController();
    const reason = { code: 'live-abort' };
    const client = createClient({
      throttle: 1,
      requestOptions: { signal: controller.signal },
    });

    const walk = client.similar({ appId: TRANSLATE }).catch((error: unknown) => error);
    setTimeout(() => {
      controller.abort(reason);
    }, ABORT_AFTER_MS);

    await expect(walk).resolves.toBe(reason);
  });
});
