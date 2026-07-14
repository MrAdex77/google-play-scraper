import { expect, it } from 'vitest';
import { NotFoundError } from '../src/index.js';
import { liveClient, liveDescribe } from './helpers.js';

liveDescribe('app live contract', () => {
  it('returns details for a popular free app', async () => {
    const appId = 'com.google.android.apps.translate';
    const result = await liveClient.app({ appId });

    expect(result.title.length).toBeGreaterThan(0);
    expect(result.appId).toBe(appId);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(5);
    expect(result.ratings).toBeGreaterThan(100000);
    expect(result.free).toBe(true);
  });

  it('returns details for a mobile geography game', async () => {
    const appId = 'com.adex77.WhereAmI';
    const result = await liveClient.app({ appId });

    expect(result.title).toBe('Where Am I? - GeoGuess Game');
    expect(result.appId).toBe(appId);
    expect(result.released).toBe('Jan 2, 2021');
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(5);
    expect(result.maxInstalls).toBeGreaterThan(10000);
    expect(result.free).toBe(true);
  });

  it('returns details for a paid app', async () => {
    const result = await liveClient.app({ appId: 'com.mojang.minecraftpe' });

    expect(result.title.length).toBeGreaterThan(0);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(5);
    expect(result.free).toBe(false);
    expect(result.price).toBeGreaterThan(0);
  });

  it('returns categorized details for a social app', async () => {
    const result = await liveClient.app({ appId: 'com.instagram.android' });

    expect(result.title).toContain('Instagram');
    expect(result.genreId).toBe('SOCIAL');
    expect(result.categories.some((category) => category.id === 'SOCIAL')).toBe(true);
    expect(typeof result.adSupported).toBe('boolean');
    expect(result.installs?.endsWith('+')).toBe(true);
  });

  it('localizes the geography game details for another language and country', async () => {
    const result = await liveClient.app({
      appId: 'com.adex77.WhereAmI',
      lang: 'pl',
      country: 'pl',
    });

    expect(result.appId).toBe('com.adex77.WhereAmI');
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.description.length).toBeGreaterThan(0);
    expect(result.free).toBe(true);
  });

  it('rejects a nonexistent package with a NotFoundError', async () => {
    await expect(
      liveClient.app({ appId: 'com.adex77.definitely.not.a.real.app' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      liveClient.app({
        appId: 'com.google.android.apps.translate',
        requestOptions: { signal: controller.signal },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
