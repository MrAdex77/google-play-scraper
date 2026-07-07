import { describe, expect, it } from 'vitest';
import { search, type App, type SearchResult } from '../src/index.js';

describe('search live contract', () => {
  it('returns unique valid apps for a broad term', async () => {
    const results = (await search({ term: 'panda', num: 30 })) as SearchResult[];

    expect(results.length).toBeGreaterThan(10);
    expect(new Set(results.map((item) => item.appId)).size).toBe(results.length);

    for (const item of results) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.url.startsWith('https://play.google.com')).toBe(true);
      expect(typeof item.price).toBe('number');
      expect(typeof item.free).toBe('boolean');
      if (item.score !== undefined) {
        expect(item.score).toBeGreaterThanOrEqual(0);
        expect(item.score).toBeLessThanOrEqual(5);
      }
    }
  });

  it('returns only free apps when the price filter is free', async () => {
    const results = (await search({ term: 'vpn', price: 'free', num: 20 })) as SearchResult[];

    expect(results.length).toBeGreaterThan(0);
    for (const item of results) {
      expect(item.free).toBe(true);
      expect(item.price).toBe(0);
    }
  });

  it('resolves full app details when fullDetail is set', async () => {
    const results = (await search({ term: 'panda', num: 3, fullDetail: true })) as App[];

    expect(results).toHaveLength(3);
    for (const item of results) {
      expect(typeof item.description).toBe('string');
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.appId.length).toBeGreaterThan(0);
    }
  });
});
