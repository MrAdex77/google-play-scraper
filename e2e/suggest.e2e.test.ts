import { expect, it } from 'vitest';
import { liveClient, liveDescribe } from './helpers.ts';

const COMPLETING_TERMS = ['where am', 'pand'];

liveDescribe('suggest live contract', () => {
  it.for(COMPLETING_TERMS)(
    'returns between one and five nonempty completions for %s',
    async (term, { annotate }) => {
      const results = await liveClient.suggest({ term });
      const echoing = results.filter((suggestion) => suggestion.toLowerCase().includes(term));

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(5);
      for (const suggestion of results) {
        expect(typeof suggestion).toBe('string');
        expect(suggestion.length).toBeGreaterThan(0);
      }
      await annotate(
        `${echoing.length.toString()} of ${results.length.toString()} completions echo "${term}"`,
        'notice',
      );
    },
  );

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
