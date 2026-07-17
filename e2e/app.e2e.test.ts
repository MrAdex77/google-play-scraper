import { expect, it } from 'vitest';
import { NotFoundError } from '../src/index.js';
import { liveClient, liveDescribe } from './helpers.js';

const TRANSLATE_STABLE_FIELDS = [
  'summary',
  'installs',
  'minInstalls',
  'maxInstalls',
  'score',
  'scoreText',
  'ratings',
  'reviews',
  'currency',
  'developerEmail',
  'developerWebsite',
  'privacyPolicy',
  'headerImage',
  'contentRating',
  'recentChanges',
] as const;

const MINECRAFT_RICH_FIELDS = [
  'video',
  'videoImage',
  'IAPRange',
  'released',
  'contentRatingDescription',
] as const;

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

  it('fills every stable optional field for a flagship listing', async () => {
    const result = await liveClient.app({ appId: 'com.google.android.apps.translate' });
    const record = result as unknown as Record<string, unknown>;

    for (const field of TRANSLATE_STABLE_FIELDS) {
      expect(record[field], field).toBeDefined();
    }
    expect(result.screenshots.length).toBeGreaterThanOrEqual(5);
  });

  it('fills media and purchase fields for a rich paid listing', async () => {
    const result = await liveClient.app({ appId: 'com.mojang.minecraftpe' });
    const record = result as unknown as Record<string, unknown>;

    for (const field of MINECRAFT_RICH_FIELDS) {
      expect(record[field], field).toBeDefined();
    }
  });

  it('reports the free with ads and purchases commercial model', async () => {
    const result = await liveClient.app({ appId: 'com.king.candycrushsaga' });

    expect(result.free).toBe(true);
    expect(result.price).toBe(0);
    expect(result.offersIAP).toBe(true);
    expect(result.IAPRange).toBeDefined();
    expect(result.adSupported).toBe(true);
    expect(result.preregister).toBe(false);
    expect(result.available).toBe(true);
  });

  it('localizes the paid price into the storefront currency', async () => {
    const result = await liveClient.app({
      appId: 'com.mojang.minecraftpe',
      lang: 'de',
      country: 'de',
    });

    expect(result.free).toBe(false);
    expect(result.price).toBeGreaterThan(0);
    expect(result.currency).toBe('EUR');
    expect(result.priceText).toContain('€');
  });

  it('exposes the trader legal fields on an eu storefront', async () => {
    const result = await liveClient.app({
      appId: 'com.google.android.apps.translate',
      lang: 'de',
      country: 'de',
    });

    expect(result.developerLegalName).toBeDefined();
    expect(result.developerLegalEmail).toBeDefined();
    expect(result.developerLegalAddress).toBeDefined();
    expect(result.developerLegalPhoneNumber).toBeDefined();
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
