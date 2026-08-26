import { expect, it } from 'vitest';
import { NotFoundError, type App, type IntegrityEvent } from '../src/index.js';
import { expectListingContract } from './contracts.js';
import { expectFieldFilledSomewhere, liveClient, liveDescribe } from './helpers.js';

const TRANSLATE = 'com.google.android.apps.translate';
const GEO_GAME = 'com.adex77.WhereAmI';
const MINECRAFT = 'com.mojang.minecraftpe';

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
] as const;

const RICH_MEDIA_LISTINGS = [MINECRAFT, 'com.king.candycrushsaga', 'com.roblox.client'];

const OPTIONAL_MEDIA_FIELDS = [
  'video',
  'videoImage',
  'IAPRange',
  'released',
  'contentRatingDescription',
  'recentChanges',
] as const;

function asRecord(listing: App): Record<string, unknown> {
  return listing;
}

liveDescribe('app live contract', () => {
  it('returns details for a popular free app', async () => {
    const events: IntegrityEvent[] = [];
    const result = await liveClient.app({
      appId: TRANSLATE,
      onIntegrityEvent: (event) => events.push(event),
    });

    expectListingContract(result, 'flagship listing');
    expect(result.appId).toBe(TRANSLATE);
    expect(typeof result.score).toBe('number');
    expect(result.ratings).toBeGreaterThan(100000);
    expect(result.free).toBe(true);
    expect(events).toEqual([]);
  });

  it('returns details for a mobile geography game', async () => {
    const result = await liveClient.app({ appId: GEO_GAME });

    expectListingContract(result, 'geography game listing');
    expect(result.title).toBe('Where Am I? - GeoGuess Game');
    expect(result.appId).toBe(GEO_GAME);
    expect(result.released).toBe('Jan 2, 2021');
    expect(result.developer).toBe('Adex77');
    expect(result.free).toBe(true);
  });

  it('returns details for a paid app', async () => {
    const result = await liveClient.app({ appId: MINECRAFT });

    expectListingContract(result, 'paid listing');
    expect(result.free).toBe(false);
    expect(result.price).toBeGreaterThan(0);
    expect(result.currency).toBe('USD');
  });

  it('returns categorized details for a social app', async () => {
    const result = await liveClient.app({ appId: 'com.instagram.android' });

    expectListingContract(result, 'social listing');
    expect(result.title).toContain('Instagram');
    expect(result.genreId).toBe('SOCIAL');
    expect(result.categories.some((category) => category.id === 'SOCIAL')).toBe(true);
    expect(result.installs?.endsWith('+')).toBe(true);
  });

  it('localizes the geography game details for another language and country', async () => {
    const result = await liveClient.app({ appId: GEO_GAME, lang: 'pl', country: 'pl' });

    expectListingContract(result, 'localized geography game listing');
    expect(result.appId).toBe(GEO_GAME);
    expect(result.currency).toBe('PLN');
    expect(result.free).toBe(true);
  });

  it('fills every stable optional field for a flagship listing', async () => {
    const result = await liveClient.app({ appId: TRANSLATE });
    const record = asRecord(result);

    for (const field of TRANSLATE_STABLE_FIELDS) {
      expect(record[field], field).toBeDefined();
    }
    expect(result.screenshots.length).toBeGreaterThanOrEqual(5);
  });

  it('fills every optional media field on the maintained listing', async () => {
    const result = await liveClient.app({ appId: GEO_GAME });

    expectListingContract(result, 'maintained media listing');
    expectFieldFilledSomewhere('app optional media', [asRecord(result)], OPTIONAL_MEDIA_FIELDS);
  });

  it('resolves rich third party listings without a spec failure', async () => {
    const listings = await Promise.all(
      RICH_MEDIA_LISTINGS.map((appId) => liveClient.app({ appId })),
    );

    for (const listing of listings) {
      expectListingContract(listing, 'rich media listing');
    }
  });

  it('reports the free with ads and purchases commercial model', async () => {
    const result = await liveClient.app({ appId: GEO_GAME });

    expectListingContract(result, 'commercial model listing');
    expect(result.free).toBe(true);
    expect(result.price).toBe(0);
    expect(result.preregister).toBe(false);
    expect(result.available).toBe(true);
    expect(result.adSupported).toBe(true);
    expect(result.offersIAP).toBe(true);
    expect(result.IAPRange?.trim().length).toBeGreaterThan(0);
  });

  it('localizes the paid price into the storefront currency', async () => {
    const result = await liveClient.app({ appId: MINECRAFT, lang: 'de', country: 'de' });

    expectListingContract(result, 'german storefront listing');
    expect(result.free).toBe(false);
    expect(result.price).toBeGreaterThan(0);
    expect(result.currency).toBe('EUR');
    expect(result.priceText).toContain('€');
  });

  it('exposes the trader legal fields on an eu storefront', async () => {
    const result = await liveClient.app({ appId: TRANSLATE, lang: 'de', country: 'de' });

    expect(result.developerLegalName?.trim().length).toBeGreaterThan(0);
    expect(result.developerLegalEmail?.trim().length).toBeGreaterThan(0);
    expect(result.developerLegalAddress?.trim().length).toBeGreaterThan(0);
    expect(result.developerLegalPhoneNumber?.trim().length).toBeGreaterThan(0);
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
      liveClient.app({ appId: TRANSLATE, requestOptions: { signal: controller.signal } }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
