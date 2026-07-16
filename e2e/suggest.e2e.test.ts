import { expect, it } from 'vitest';
import { liveClient, liveDescribe } from './helpers.js';

liveDescribe('suggest live contract', () => {
  it('completes the where am i phrase with related suggestions', async () => {
    const results = await liveClient.suggest({ term: 'where am' });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(5);
    expect(results.some((suggestion) => suggestion.toLowerCase().includes('where'))).toBe(true);
  });

  it('returns between one and five nonempty completions', async () => {
    const results = await liveClient.suggest({ term: 'pand' });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(5);
    for (const suggestion of results) {
      expect(typeof suggestion).toBe('string');
      expect(suggestion.length).toBeGreaterThan(0);
    }
  });

  it('returns an empty array when nothing completes the term', async () => {
    const results = await liveClient.suggest({ term: 'zzqqxxzzqqxxzz' });

    expect(results).toEqual([]);
  });

  it('returns localized completions for a polish term', async () => {
    const results = await liveClient.suggest({ term: 'gra', lang: 'pl', country: 'pl' });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(5);
    for (const suggestion of results) {
      expect(suggestion.length).toBeGreaterThan(0);
    }
  });
});
