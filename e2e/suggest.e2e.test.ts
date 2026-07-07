import { expect, it } from 'vitest';
import { suggest } from '../src/index.js';
import { liveDescribe, throttled } from './helpers.js';

liveDescribe('suggest live contract', () => {
  it('returns between one and five nonempty completions', async () => {
    const results = await suggest(throttled({ term: 'pand' }));

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(5);
    for (const suggestion of results) {
      expect(typeof suggestion).toBe('string');
      expect(suggestion.length).toBeGreaterThan(0);
    }
  });
});
