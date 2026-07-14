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
});
