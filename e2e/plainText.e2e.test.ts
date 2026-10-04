import { expect, it } from 'vitest';
import type { AppItem } from '../src/index.ts';
import { expectPlainSummaries } from '../test/helpers/plainText.ts';
import { expectListingContract } from './contracts.ts';
import { liveClient, liveDescribe } from './helpers.ts';

const MULTI_LINE_SHARE = 0.5;
const GOOGLE_DEVELOPER_ID = '5700313618786177705';
const PREREGISTERED_GAME = 'com.tencent.mhadv';
const ENTITY_SUMMARY_APPS = [PREREGISTERED_GAME, 'psplay.grill.com', 'org.khankids.android'];
const MARKUP_CHANGELOG_APPS = ['net.dinglisch.android.taskerm', 'com.robtopx.geometryjump'];
const STOREFRONTS = [
  { lang: 'ja', country: 'jp' },
  { lang: 'ar', country: 'sa' },
  { lang: 'de', country: 'de' },
] as const;

function multiLineShare(items: readonly AppItem[]): number {
  const multiLine = items.filter((item) => item.summary?.includes('\n') === true);
  return multiLine.length / items.length;
}

liveDescribe('plain text summaries live contract', () => {
  it('returns plain text summaries for a full action game chart', async () => {
    const items = await liveClient.list({
      category: 'GAME_ACTION',
      collection: 'TOP_FREE',
      num: 200,
    });

    expectPlainSummaries(items);
    expect(multiLineShare(items)).toBeGreaterThan(MULTI_LINE_SHARE);
  });

  it('returns plain text summaries for chess search results', async () => {
    const results = await liveClient.search({ term: 'chess', num: 30 });

    expectPlainSummaries(results);
    expect(multiLineShare(results)).toBeGreaterThan(MULTI_LINE_SHARE);
  });

  it('returns plain text summaries for a preregistered game cluster', async () => {
    const items = await liveClient.similar({ appId: PREREGISTERED_GAME });

    expectPlainSummaries(items);
    expect(items.length).toBeGreaterThan(0);
  });

  it('returns plain text summaries for a developer catalogue', async () => {
    const items = await liveClient.developer({ devId: GOOGLE_DEVELOPER_ID, num: 60 });

    expectPlainSummaries(items);
    expect(items.length).toBeGreaterThan(0);
  });

  it('returns plain text summaries on non latin storefronts', async () => {
    for (const { lang, country } of STOREFRONTS) {
      const items = await liveClient.list({
        category: 'APPLICATION',
        collection: 'TOP_FREE',
        num: 100,
        lang,
        country,
      });

      expectPlainSummaries(items);
    }
  });

  it('decodes the summary of listings that google serves entity encoded', async () => {
    for (const appId of ENTITY_SUMMARY_APPS) {
      const listing = await liveClient.app({ appId });

      expectListingContract(listing, `entity summary ${appId}`);
      expect(listing.summary?.length).toBeGreaterThan(0);
    }
  });

  it('returns plain text changelogs that google serves as markup', async () => {
    for (const appId of MARKUP_CHANGELOG_APPS) {
      const listing = await liveClient.app({ appId });

      expectListingContract(listing, `markup changelog ${appId}`);
      expect(listing.recentChanges?.length).toBeGreaterThan(0);
    }
  });

  it('keeps listings plain text on every storefront', async () => {
    for (const { lang, country } of STOREFRONTS) {
      const listing = await liveClient.app({ appId: PREREGISTERED_GAME, lang, country });

      expectListingContract(listing, `${country} storefront listing`);
    }
  });
});
