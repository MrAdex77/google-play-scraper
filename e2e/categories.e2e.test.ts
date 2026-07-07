import { expect, it } from 'vitest';
import { categories, list, type ListItem } from '../src/index.js';
import { liveDescribe, throttled } from './helpers.js';

liveDescribe('categories live contract', () => {
  it('returns more than thirty uppercase categories including GAME and APPLICATION', async () => {
    const result = await categories();

    expect(result.length).toBeGreaterThan(30);
    expect(result).toContain('GAME');
    expect(result).toContain('SOCIAL');
    expect(result).toContain('APPLICATION');
    for (const id of result) {
      expect(id).toMatch(/^[A-Z_]+$/);
    }
  });

  it('returns codes that resolve to real Google Play category listings', async () => {
    const all = await categories();
    const sample = ['GAME_PUZZLE', 'MAPS_AND_NAVIGATION', 'PHOTOGRAPHY'] as const;

    for (const cat of sample) {
      expect(all).toContain(cat);
      const items = (await list(
        throttled({
          collection: 'TOP_FREE',
          category: cat,
          num: 3,
        }),
      )) as ListItem[];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]!.appId.length).toBeGreaterThan(0);
    }
  });
});
