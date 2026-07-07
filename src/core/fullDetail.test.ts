import { describe, expect, it } from 'vitest';
import { resolveFullDetail, type GetAppParams } from './fullDetail.js';

const options = { lang: 'en', country: 'us' };

describe('resolveFullDetail', () => {
  it('resolves every item in order through getApp', async () => {
    const items = [{ appId: 'a' }, { appId: 'b' }, { appId: 'c' }];
    const seen: string[] = [];

    const result = await resolveFullDetail(items, options, (params: GetAppParams) => {
      seen.push(params.appId);
      return Promise.resolve({ appId: params.appId, detail: params.appId.toUpperCase() });
    });

    expect(result).toEqual([
      { appId: 'a', detail: 'A' },
      { appId: 'b', detail: 'B' },
      { appId: 'c', detail: 'C' },
    ]);
    expect(seen.sort()).toEqual(['a', 'b', 'c']);
  });

  it('forwards language, country, throttle and request options to getApp', async () => {
    const captured: GetAppParams[] = [];
    await resolveFullDetail(
      [{ appId: 'only' }],
      { lang: 'pl', country: 'de', throttle: 5, requestOptions: { retries: 1 } },
      (params: GetAppParams) => {
        captured.push(params);
        return Promise.resolve(null);
      },
    );

    expect(captured[0]).toEqual({
      appId: 'only',
      lang: 'pl',
      country: 'de',
      throttle: 5,
      requestOptions: { retries: 1 },
    });
  });

  it('never runs more than the configured concurrency at once', async () => {
    const items = Array.from({ length: 9 }, (_unused, index) => ({ appId: index.toString() }));
    let inFlight = 0;
    let peak = 0;

    await resolveFullDetail(
      items,
      options,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return null;
      },
      2,
    );

    expect(peak).toBeLessThanOrEqual(2);
  });

  it('returns an empty array without invoking getApp for no items', async () => {
    let calls = 0;
    const result = await resolveFullDetail([], options, () => {
      calls += 1;
      return Promise.resolve(null);
    });

    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });
});
