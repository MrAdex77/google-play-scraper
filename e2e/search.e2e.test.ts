import { expect, it } from 'vitest';
import { clientFromOptions } from '../src/core/http.js';
import { fetchSearchFirstPage } from '../src/features/search/search.js';
import { type App, type DegradationEvent, type SearchResult } from '../src/index.js';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.js';

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

  it('serves at least the full first page when num exceeds the google cap', async () => {
    const events: DegradationEvent[] = [];
    const results = (await liveClient.search({
      term: 'game',
      num: 100,
      onDegradation: (event) => events.push(event),
    })) as SearchResult[];

    expect(results.length).toBeGreaterThanOrEqual(25);
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
