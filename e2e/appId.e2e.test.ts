import { expect, it } from 'vitest';
import { appIdSchema } from '../src/core/options.ts';
import { category, collection, createClient, ValidationError } from '../src/index.ts';
import { expectReviewsContract } from './contracts.ts';
import { liveClient, liveDescribe } from './helpers.ts';

const UPPERCASE_SEGMENTS_ID = 'com.miHoYo.GenshinImpact';
const UNDERSCORE_ID = 'com.bandainamcoent.dblegends_ww';
const GEO_GAME_ID = 'com.adex77.WhereAmI';
const FOLDED_UNICODE_ID = 'com.żółw.app';
const LIST_SIZE = 100;
const SEARCH_TERMS = ['calculator', '2048', 'vpn'] as const;

const isValidAppId = (appId: string): boolean => appIdSchema.safeParse(appId).success;

liveDescribe('app id validation live contract', () => {
  it('still serves details and reviews for an id with uppercase segments', async () => {
    const listing = await liveClient.app({ appId: UPPERCASE_SEGMENTS_ID });
    const page = await liveClient.reviews({ appId: UPPERCASE_SEGMENTS_ID, num: 3 });

    expect(listing.appId).toBe(UPPERCASE_SEGMENTS_ID);
    expect(listing.url).toContain(`id=${UPPERCASE_SEGMENTS_ID}&`);
    expect(page.data).toHaveLength(3);
    expectReviewsContract(page.data, 'uppercase segments id');
  });

  it('still serves details and reviews for an id with underscores', async () => {
    const listing = await liveClient.app({ appId: UNDERSCORE_ID });
    const page = await liveClient.reviews({ appId: UNDERSCORE_ID, num: 3 });

    expect(listing.appId).toBe(UNDERSCORE_ID);
    expect(page.data).toHaveLength(3);
    expectReviewsContract(page.data, 'underscore id');
  });

  it('still serves the report surfaces for a mixed case id', async () => {
    const safety = await liveClient.dataSafety({ appId: GEO_GAME_ID });
    const permissions = await liveClient.permissions({ appId: GEO_GAME_ID });
    const reach = await liveClient.availability({ appId: GEO_GAME_ID, countries: ['us'] });

    expect(safety.securityPractices.length).toBeGreaterThan(0);
    expect(permissions.length).toBeGreaterThan(0);
    expect(reach.countries.us).toEqual({ status: 'available' });
  });

  it('rejects a unicode id on every method before any request leaves the process', async () => {
    let requests = 0;
    const countingFetch: typeof fetch = (input, init) => {
      requests += 1;
      return fetch(input, init);
    };
    const client = createClient({ requestOptions: { fetchImpl: countingFetch } });
    const appId = FOLDED_UNICODE_ID;

    await expect(client.app({ appId })).rejects.toBeInstanceOf(ValidationError);
    const entries = await client.apps({ appIds: [appId] });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ appId, status: 'rejected' });
    expect(entries[0]?.status === 'rejected' && entries[0].error).toBeInstanceOf(ValidationError);
    await expect(client.similar({ appId })).rejects.toBeInstanceOf(ValidationError);
    await expect(client.permissions({ appId })).rejects.toBeInstanceOf(ValidationError);
    await expect(client.dataSafety({ appId })).rejects.toBeInstanceOf(ValidationError);
    await expect(client.reviews({ appId, num: 5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(client.reviewsAll({ appId })).rejects.toBeInstanceOf(ValidationError);
    await expect(client.availability({ appId, countries: ['us'] })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(() => client.reviewsIterator({ appId })).toThrow(ValidationError);

    expect(requests).toBe(0);
  });

  it('accepts every app id Google serves in charts, search and similar listings', async ({
    annotate,
  }) => {
    const served = new Set<string>();
    const charts = [
      { category: category.APPLICATION, country: 'us' },
      { category: category.GAME, country: 'jp' },
      { category: category.FINANCE, country: 'br' },
    ] as const;
    for (const chart of charts) {
      const items = await liveClient.list({
        ...chart,
        collection: collection.TOP_FREE,
        num: LIST_SIZE,
      });
      expect(items.length).toBeGreaterThan(0);
      items.forEach((item) => served.add(item.appId));
    }
    for (const term of SEARCH_TERMS) {
      const items = await liveClient.search({ term, num: 30 });
      expect(items.length).toBeGreaterThan(0);
      items.forEach((item) => served.add(item.appId));
    }
    const related = await liveClient.similar({ appId: GEO_GAME_ID });
    expect(related.length).toBeGreaterThan(0);
    related.forEach((item) => served.add(item.appId));

    const rejected = [...served].filter((appId) => !isValidAppId(appId));

    expect(rejected).toEqual([]);
    await annotate(`${served.size.toString()} served app ids satisfy the schema`, 'notice');
  });
});
