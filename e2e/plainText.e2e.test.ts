import { beforeEach, expect, it, vi } from 'vitest';
import { plainText } from '../src/core/htmlText.ts';
import { app } from '../src/features/app/app.ts';
import { createSearch } from '../src/features/search/search.ts';
import type { AppItem } from '../src/index.ts';
import {
  expectConvertedOnce,
  expectConvertedSummaries,
  expectHtmlSummaries,
} from '../test/helpers/plainText.ts';
import { expectListingContract } from './contracts.ts';
import { liveClient, liveDescribe, memoizingResolveClient } from './helpers.ts';
import { findSearchContinuationAnchor } from './searchAnchors.ts';

vi.mock(import('../src/core/htmlText.ts'), { spy: true });

const plainTextSpy = vi.mocked(plainText);

const MULTI_LINE_SHARE = 0.5;
const GOOGLE_DEVELOPER_ID = '5700313618786177705';
const GOOGLE_DEVELOPER_NAME = 'Google LLC';
const PREREGISTERED_GAME = 'com.tencent.mhadv';
const ENTITY_SUMMARY_APPS = [PREREGISTERED_GAME, 'psplay.grill.com', 'org.khankids.android'];
const MARKUP_CHANGELOG_APPS = ['net.dinglisch.android.taskerm', 'com.robtopx.geometryjump'];
const PACKAGE_ID_SEARCHES = ['com.spotify.music', 'com.whatsapp'];
const SEARCH_CONTINUATION_EXTRA = 30;
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
  beforeEach(() => {
    plainTextSpy.mockClear();
  });

  it('returns plain text summaries for a full action game chart', async () => {
    const items = await liveClient.list({
      category: 'GAME_ACTION',
      collection: 'TOP_FREE',
      num: 200,
    });

    expectConvertedSummaries(plainTextSpy, items, 'action chart');
    expectHtmlSummaries(items, 'action chart');
    expect(multiLineShare(items)).toBeGreaterThan(MULTI_LINE_SHARE);
  });

  it('returns plain text summaries for chess search results', async () => {
    const results = await liveClient.search({ term: 'chess', num: 30 });

    expectConvertedSummaries(plainTextSpy, results, 'chess search');
    expectHtmlSummaries(results, 'chess search');
    expect(multiLineShare(results)).toBeGreaterThan(MULTI_LINE_SHARE);
  });

  it('returns plain text summaries for package id searches', async () => {
    for (const term of PACKAGE_ID_SEARCHES) {
      plainTextSpy.mockClear();
      const results = await liveClient.search({ term, num: 5 });

      expectConvertedSummaries(plainTextSpy, results, `${term} search`);
    }
  });

  it('returns plain text summaries past the first search page', async () => {
    const resolveClient = memoizingResolveClient();
    const { query, page } = await findSearchContinuationAnchor(resolveClient);
    plainTextSpy.mockClear();

    const results = await createSearch(
      app,
      resolveClient,
    )({
      term: query.term,
      num: page.apps.length + SEARCH_CONTINUATION_EXTRA,
    });

    expect(results.length).toBeGreaterThan(page.apps.length);
    expectConvertedSummaries(
      plainTextSpy,
      results.slice(page.apps.length),
      `${query.term} search continuation`,
    );
  });

  it('returns plain text summaries for a preregistered game cluster', async () => {
    const items = await liveClient.similar({ appId: PREREGISTERED_GAME });

    expectConvertedSummaries(plainTextSpy, items, 'preregistered cluster');
    expectHtmlSummaries(items, 'preregistered cluster');
    expect(items.length).toBeGreaterThan(0);
  });

  it('returns plain text summaries for a developer catalogue', async () => {
    const items = await liveClient.developer({ devId: GOOGLE_DEVELOPER_ID, num: 60 });

    expectConvertedSummaries(plainTextSpy, items, 'numeric developer');
    expectHtmlSummaries(items, 'numeric developer');
    expect(items.length).toBeGreaterThan(0);
  });

  it('returns plain text summaries for a name developer catalogue', async () => {
    const items = await liveClient.developer({ devId: GOOGLE_DEVELOPER_NAME, num: 60 });

    expectConvertedSummaries(plainTextSpy, items, 'name developer');
    expectHtmlSummaries(items, 'name developer');
    expect(items.length).toBeGreaterThan(0);
  });

  it('returns plain text summaries on non latin storefronts', async () => {
    for (const { lang, country } of STOREFRONTS) {
      plainTextSpy.mockClear();
      const items = await liveClient.list({
        category: 'APPLICATION',
        collection: 'TOP_FREE',
        num: 100,
        lang,
        country,
      });

      expectConvertedSummaries(plainTextSpy, items, `${country} chart`);
      expectHtmlSummaries(items, `${country} chart`);
    }
  });

  it('decodes the summary of listings that google serves entity encoded', async () => {
    for (const appId of ENTITY_SUMMARY_APPS) {
      plainTextSpy.mockClear();
      const listing = await liveClient.app({ appId });

      expectListingContract(listing, `entity summary ${appId}`);
      expectConvertedOnce(plainTextSpy, [listing.summary], `${appId} summary`);
    }
  });

  it('returns plain text changelogs that google serves as markup', async () => {
    for (const appId of MARKUP_CHANGELOG_APPS) {
      plainTextSpy.mockClear();
      const listing = await liveClient.app({ appId });

      expectListingContract(listing, `markup changelog ${appId}`);
      expectConvertedOnce(plainTextSpy, [listing.recentChanges], `${appId} recentChanges`);
    }
  });

  it('keeps listings plain text on every storefront', async () => {
    for (const { lang, country } of STOREFRONTS) {
      plainTextSpy.mockClear();
      const listing = await liveClient.app({ appId: PREREGISTERED_GAME, lang, country });

      expectListingContract(listing, `${country} storefront listing`);
      expectConvertedOnce(
        plainTextSpy,
        [listing.description, listing.summary],
        `${country} storefront listing`,
      );
    }
  });
});
