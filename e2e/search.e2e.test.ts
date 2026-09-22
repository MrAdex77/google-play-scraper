import { expect, it } from 'vitest';
import { clientFromOptions, type HttpClient, type ResolveClient } from '../src/core/http.ts';
import { app } from '../src/features/app/app.ts';
import { createSearch, fetchSearchFirstPage } from '../src/features/search/search.ts';
import {
  type App,
  type DegradationEvent,
  type IntegrityEvent,
  type SearchResult,
} from '../src/index.ts';
import {
  expectAppItemsContract,
  expectRequestedCountContract,
  expectSearchListingAgreement,
} from './contracts.ts';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.ts';

const GEO_GAME = 'com.adex77.WhereAmI';
const EXACT_MATCH_CARD_CANDIDATES = [
  'com.spotify.music',
  'com.whatsapp',
  'com.duolingo',
  'com.pandaexpress.app',
];

function memoizingResolveClient(): ResolveClient {
  const underlying = clientFromOptions({ throttle: 1 });
  const cache = new Map<string, Promise<string>>();
  const client: HttpClient = {
    request(req) {
      const key = `${req.method ?? 'GET'} ${req.url} ${req.body ?? ''}`;
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const pending = underlying.request(req);
      cache.set(key, pending);
      return pending;
    },
  };
  return () => client;
}

liveDescribe('search live contract', () => {
  it('returns unique valid apps for a broad term', async () => {
    const events: IntegrityEvent[] = [];
    const num = 30;
    const results = (await liveClient.search({
      term: 'panda',
      num,
      onIntegrityEvent: (event) => events.push(event),
    })) as SearchResult[];

    expectRequestedCountContract(results.length, num, 'broad term search');
    expectAppItemsContract(results, 'broad term search');
    expect(events).toEqual([]);
  });

  it('agrees with the listing surface for the Where Am I game', async (ctx) => {
    const listing = await liveClient.app({ appId: GEO_GAME });
    const results = (await liveClient.search({ term: listing.title, num: 30 })) as SearchResult[];

    expectAppItemsContract(results, 'owned title search');

    const match = results.find((item) => item.appId === GEO_GAME);
    if (match === undefined) {
      ctx.skip(`${GEO_GAME} is not indexed for its own title right now`);
      return;
    }
    expectSearchListingAgreement(match, listing, 'owned title search');
    expect(match.free, 'owned title search: both surfaces must agree on the offer').toBe(
      listing.free,
    );
  });

  it('returns only free apps when the price filter is free', async () => {
    const num = 20;
    const results = (await liveClient.search({
      term: 'vpn',
      price: 'free',
      num,
    })) as SearchResult[];

    expectRequestedCountContract(results.length, num, 'free filtered search');
    expectAppItemsContract(results, 'free filtered search');
    for (const item of results) {
      expect(item.free).toBe(true);
      expect(item.price).toBe(0);
    }
  });

  it('returns an empty array for a term with no results', async () => {
    const results = await liveClient.search({ term: 'zxqwkjhzxqwkjhqpz', num: 30 });

    expect(results).toEqual([]);
  });

  it('returns only paid apps when the price filter is paid', async () => {
    const num = 10;
    const results = (await liveClient.search({
      term: 'minecraft',
      price: 'paid',
      num,
    })) as SearchResult[];

    expectRequestedCountContract(results.length, num, 'paid filtered search');
    expectAppItemsContract(results, 'paid filtered search');
    for (const item of results) {
      expect(item.free).toBe(false);
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it('returns results for a non latin search term', async () => {
    const num = 10;
    const results = (await liveClient.search({ term: 'ポケモン', num })) as SearchResult[];

    expectRequestedCountContract(results.length, num, 'non latin search');
    expectAppItemsContract(results, 'non latin search');
  });

  it('returns localized results for a german term with diacritics', async () => {
    const num = 20;
    const results = (await liveClient.search({
      term: 'übersetzer',
      lang: 'de',
      country: 'de',
      num,
    })) as SearchResult[];

    expectRequestedCountContract(results.length, num, 'german search');
    expect(results.some((item) => item.title.toLowerCase().includes('übersetzer'))).toBe(true);
    expectAppItemsContract(results, 'german search');
  });

  it('serves the full first page without truncation when num exceeds the google cap', async () => {
    const events: DegradationEvent[] = [];
    const resolveClient = memoizingResolveClient();
    const search = createSearch(app, resolveClient);

    const { page } = await fetchSearchFirstPage(
      { term: 'game', lang: 'en', country: 'us', price: 'all', throttle: 1 },
      resolveClient,
    );

    expect(page.token).toBeUndefined();
    expect(page.apps.length, 'first page search: the live page must serve results').toBeGreaterThan(
      0,
    );

    const results = (await search({
      term: 'game',
      num: page.apps.length + 1,
      onDegradation: (event) => events.push(event),
    })) as SearchResult[];

    const firstPageIds = page.apps.map((item) => item.appId);
    const resultIds = results.map((item) => item.appId);

    expect(resultIds).toEqual(firstPageIds);
    expectAppItemsContract(results, 'first page search');
    expectFieldCoverage('search', results, {
      score: 0.8,
      scoreText: 0.8,
      summary: 0.8,
      currency: 0.8,
    });
    expect(events).toEqual([]);
  });

  it('confirms google still serves an exact match card for a package id search', async ({
    annotate,
  }) => {
    const events: IntegrityEvent[] = [];

    const surfaced: string[] = [];
    for (const appId of EXACT_MATCH_CARD_CANDIDATES) {
      const results = (await liveClient.search({
        term: appId,
        num: 5,
        onIntegrityEvent: (event) => events.push(event),
      })) as SearchResult[];

      expectAppItemsContract(results, 'exact match search');
      const first = results[0];
      if (first?.appId === appId && first.developerId !== undefined) {
        surfaced.push(appId);
      }
    }

    expect(
      events.map((event) => event.reason),
      'exact match card drift: section-anchor-fallback means re-pin EXACT_MATCH_MAPPINGS.card in src/features/search/specs.ts, optional-section-parse means a required card field moved',
    ).toEqual([]);
    expect(
      surfaced.length,
      'no exact match card anchor still surfaces a card: repair the card paths in src/features/search/specs.ts, or re-anchor the pool if google stopped serving cards for these package ids',
    ).toBeGreaterThan(0);
    await annotate(
      `${surfaced.length.toString()} of ${EXACT_MATCH_CARD_CANDIDATES.length.toString()} anchors surfaced a card: ${surfaced.join(', ')}`,
    );
  });

  it('confirms google still serves no search continuation token', async () => {
    const { page } = await fetchSearchFirstPage(
      { term: 'game', lang: 'en', country: 'us', price: 'all', throttle: 1 },
      clientFromOptions,
    );

    expect(
      page.apps.length,
      'an empty search page cannot prove that google stopped serving a continuation token',
    ).toBeGreaterThan(0);
    expect(page.token).toBeUndefined();
  });

  it('resolves full app details for exactly the results of the same page', async () => {
    const num = 3;
    const search = createSearch(app, memoizingResolveClient());

    const summaries = (await search({ term: 'panda', num })) as SearchResult[];
    const results = (await search({ term: 'panda', num, fullDetail: true })) as App[];

    expectRequestedCountContract(summaries.length, num, 'full detail search');
    expect(results.map((item) => item.appId)).toEqual(summaries.map((item) => item.appId));
    for (const item of results) {
      expect(typeof item.description).toBe('string');
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.appId.length).toBeGreaterThan(0);
    }
  });
});
