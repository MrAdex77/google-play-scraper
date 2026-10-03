import { expect, it } from 'vitest';
import { clientFromOptions } from '../src/core/http.ts';
import { app } from '../src/features/app/app.ts';
import { createSearch, fetchSearchFirstPage } from '../src/features/search/search.ts';
import { CLUSTER_PAGE_SIZE } from '../src/core/pagination.ts';
import {
  type App,
  type DegradationEvent,
  type IntegrityEvent,
  type SearchResult,
} from '../src/index.ts';
import {
  expectAppItemsContract,
  expectContinuationContract,
  expectRequestedCountContract,
  expectSearchListingAgreement,
} from './contracts.ts';
import {
  expectFieldCoverage,
  liveClient,
  liveDescribe,
  memoizingResolveClient,
} from './helpers.ts';
import {
  findSearchContinuationAnchor,
  SEARCH_CONTINUATION_ANCHORS,
  surfacedSearchAnchors,
} from './searchAnchors.ts';

const GEO_GAME = 'com.adex77.WhereAmI';
const BLOCK_MARKER_TERM = 'unusual traffic';
const EXACT_MATCH_CARD_CANDIDATES = [
  'com.spotify.music',
  'com.whatsapp',
  'com.duolingo',
  'com.pandaexpress.app',
];

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

  it('returns results for a term the page echoes as a block marker', async () => {
    const num = 10;
    const page = await clientFromOptions({ throttle: 1 }).request({
      url: `https://play.google.com/store/search?q=${encodeURIComponent(BLOCK_MARKER_TERM)}&c=apps&hl=en&gl=us`,
    });
    const results = (await liveClient.search({ term: BLOCK_MARKER_TERM, num })) as SearchResult[];

    expect(page).toContain(BLOCK_MARKER_TERM);
    expectRequestedCountContract(results.length, num, 'block marker search');
    expectAppItemsContract(results, 'block marker search');
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

  it('returns exactly the first page when num exceeds a first page without a token', async () => {
    const events: DegradationEvent[] = [];
    const resolveClient = memoizingResolveClient();
    const search = createSearch(app, resolveClient);

    const { page } = await fetchSearchFirstPage(
      { term: 'game', lang: 'en', country: 'us', price: 'all', throttle: 1 },
      resolveClient,
    );

    expect(
      page.token,
      'the term "game" now serves a continuation token: re-anchor this tokenless probe to a term that serves none, the continuation itself is pinned by the continuation tests below',
    ).toBeUndefined();
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

  it('confirms google still serves a search continuation token for a short term', async ({
    annotate,
  }) => {
    const surfaced: string[] = [];
    for await (const anchor of surfacedSearchAnchors(clientFromOptions)) {
      expect(
        anchor.page.apps.length,
        `${anchor.query.term}: a first page that serves a token must serve results`,
      ).toBeGreaterThan(0);
      surfaced.push(anchor.query.term);
    }

    expect(
      surfaced.length,
      'no search continuation anchor serves a token any more: google changed the serving regime, re-measure the continuation and re-anchor SEARCH_CONTINUATION_ANCHORS in e2e/searchAnchors.ts',
    ).toBeGreaterThan(0);
    await annotate(
      `${surfaced.length.toString()} of ${SEARCH_CONTINUATION_ANCHORS.length.toString()} anchors served a token: ${surfaced.join(', ')}`,
    );
  });

  it('follows the search continuation past the first page', async () => {
    const events: DegradationEvent[] = [];
    const resolveClient = memoizingResolveClient();
    const search = createSearch(app, resolveClient);
    const { query, page } = await findSearchContinuationAnchor(resolveClient);
    const num = page.apps.length + 30;

    const results = (await search({
      term: query.term,
      num,
      onDegradation: (event) => events.push(event),
    })) as SearchResult[];

    expectContinuationContract(
      { firstPageCount: page.apps.length, token: page.token },
      results.length,
      num,
      `${query.term} search continuation`,
    );
    expectAppItemsContract(results, `${query.term} search continuation`);
    expect(
      results.slice(0, page.apps.length).map((item) => item.appId),
      'the continuation must append to the first page, never reorder it',
    ).toEqual(page.apps.map((item) => item.appId));
    expect(events).toEqual([]);
  });

  it('chains a second search continuation page from the token of the first', async () => {
    const events: DegradationEvent[] = [];
    const resolveClient = memoizingResolveClient();
    const search = createSearch(app, resolveClient);
    const { query, page } = await findSearchContinuationAnchor(resolveClient);
    const num = 250;

    const results = (await search({
      term: query.term,
      num,
      onDegradation: (event) => events.push(event),
    })) as SearchResult[];

    expectContinuationContract(
      { firstPageCount: page.apps.length, token: page.token },
      results.length,
      num,
      `${query.term} chained search continuation`,
    );
    expect(
      results.length,
      `${query.term}: a second continuation page must follow the ${CLUSTER_PAGE_SIZE.toString()} items of the first`,
    ).toBeGreaterThan(page.apps.length + CLUSTER_PAGE_SIZE);
    expectAppItemsContract(results, `${query.term} chained search continuation`);
    expect(events).toEqual([]);
  });

  it('keeps paging a paid search until the requested number of paid apps', async () => {
    const events: DegradationEvent[] = [];
    const resolveClient = memoizingResolveClient();
    const search = createSearch(app, resolveClient);
    const { query, page } = await findSearchContinuationAnchor(resolveClient, { price: 'paid' });
    const paidOnFirstPage = page.apps.filter((item) => !item.free).length;
    const num = paidOnFirstPage + 10;

    const results = (await search({
      term: query.term,
      price: 'paid',
      num,
      onDegradation: (event) => events.push(event),
    })) as SearchResult[];

    expectRequestedCountContract(results.length, num, `${query.term} paid continuation`);
    expect(
      results.length,
      `${query.term}: the paid filter must keep paging past the paid apps of the first page`,
    ).toBeGreaterThan(paidOnFirstPage);
    expectAppItemsContract(results, `${query.term} paid continuation`);
    for (const item of results) {
      expect(item.free).toBe(false);
    }
    expect(events).toEqual([]);
  });

  it('prices continuation apps exactly in a comma decimal storefront', async () => {
    const storefront = { lang: 'de', country: 'de', price: 'paid' } as const;
    const events: DegradationEvent[] = [];
    const resolveClient = memoizingResolveClient();
    const search = createSearch(app, resolveClient);
    const { query, page } = await findSearchContinuationAnchor(resolveClient, storefront);
    const firstPageIds = new Set(page.apps.map((item) => item.appId));

    const results = (await search({
      term: query.term,
      ...storefront,
      num: page.apps.length + 40,
      onDegradation: (event) => events.push(event),
    })) as SearchResult[];

    const continued = results.filter((item) => !firstPageIds.has(item.appId));
    expectAppItemsContract(results, `${query.term} german paid continuation`);
    expect(
      continued.length,
      `${query.term}: the german continuation must add apps past the first page`,
    ).toBeGreaterThan(0);
    expect(
      continued.some((item) => !Number.isInteger(item.price)),
      `${query.term}: a german continuation price such as 4,99 must keep its decimals`,
    ).toBe(true);
    expect(new Set(continued.flatMap((item) => item.currency ?? []))).toEqual(new Set(['EUR']));
    expect(events).toEqual([]);
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
