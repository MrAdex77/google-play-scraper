import { expect, it } from 'vitest';
import { clientFromOptions } from '../src/core/http.js';
import { fetchSearchFirstPage } from '../src/features/search/search.js';
import { type App, type DegradationEvent, type SearchResult } from '../src/index.js';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.js';

const FIRST_PAGE_CEILING = 40;

liveDescribe('search live contract', () => {
  it('returns unique valid apps for a broad term', async () => {
    const results = (await liveClient.search({ term: 'panda', num: 30 })) as SearchResult[];

    expect(results.length).toBeGreaterThan(10);
    expect(new Set(results.map((item) => item.appId)).size).toBe(results.length);

    for (const item of results) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
      expect(new URL(item.url).origin).toBe('https://play.google.com');
      expect(typeof item.price).toBe('number');
      expect(typeof item.free).toBe('boolean');
      if (item.score !== undefined) {
        expect(item.score).toBeGreaterThanOrEqual(0);
        expect(item.score).toBeLessThanOrEqual(5);
      }
    }
  });

  it('surfaces the Where Am I game when searching for it', async () => {
    const results = (await liveClient.search({ term: 'where am i', num: 30 })) as SearchResult[];

    const game = results.find((item) => item.appId === 'com.adex77.WhereAmI');
    expect(game).toBeDefined();
    expect(game?.title).toBe('Where Am I? - GeoGuess Game');
    expect(game?.developer).toBe('Adex77');
    expect(game?.free).toBe(true);
  });

  it('returns only free apps when the price filter is free', async () => {
    const results = (await liveClient.search({
      term: 'vpn',
      price: 'free',
      num: 20,
    })) as SearchResult[];

    expect(results.length).toBeGreaterThan(0);
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
    const results = (await liveClient.search({
      term: 'minecraft',
      price: 'paid',
      num: 10,
    })) as SearchResult[];

    expect(results.length).toBeGreaterThan(0);
    for (const item of results) {
      expect(item.free).toBe(false);
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it('returns results for a non latin search term', async () => {
    const results = (await liveClient.search({ term: 'ポケモン', num: 10 })) as SearchResult[];

    expect(results.length).toBeGreaterThanOrEqual(5);
    for (const item of results) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it('returns localized results for a german term with diacritics', async () => {
    const results = (await liveClient.search({
      term: 'übersetzer',
      lang: 'de',
      country: 'de',
      num: 20,
    })) as SearchResult[];

    expect(results.length).toBeGreaterThanOrEqual(10);
    expect(results.some((item) => item.title.toLowerCase().includes('übersetzer'))).toBe(true);
    for (const item of results) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it('serves the full first page without truncation when num exceeds the google cap', async () => {
    const events: DegradationEvent[] = [];
    const { page } = await fetchSearchFirstPage(
      { term: 'game', lang: 'en', country: 'us', price: 'all', throttle: 1 },
      clientFromOptions,
    );

    expect(page.token).toBeUndefined();
    expect(page.apps.length).toBeGreaterThan(10);

    const results = (await liveClient.search({
      term: 'game',
      num: 100,
      onDegradation: (event) => events.push(event),
    })) as SearchResult[];

    expect(results.length).toBeGreaterThan(10);
    expect(results.length).toBeLessThanOrEqual(FIRST_PAGE_CEILING);
    expect(new Set(results.map((item) => item.appId)).size).toBe(results.length);
    expectFieldCoverage('search', results, {
      score: 0.8,
      scoreText: 0.8,
      summary: 0.8,
      currency: 0.8,
    });
    expect(events).toEqual([]);
  });

  it('confirms google still serves no search continuation token', async () => {
    const { page } = await fetchSearchFirstPage(
      { term: 'game', lang: 'en', country: 'us', price: 'all', throttle: 1 },
      clientFromOptions,
    );

    expect(page.apps.length).toBeGreaterThanOrEqual(19);
    expect(page.token).toBeUndefined();
  });

  it('resolves full app details when fullDetail is set', async () => {
    const results = (await liveClient.search({ term: 'panda', num: 3, fullDetail: true })) as App[];

    expect(results).toHaveLength(3);
    for (const item of results) {
      expect(typeof item.description).toBe('string');
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.appId.length).toBeGreaterThan(0);
    }
  });
});
