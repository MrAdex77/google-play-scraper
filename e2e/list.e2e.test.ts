import { expect, it } from 'vitest';
import { type ListItem } from '../src/index.js';
import { expectAppItemsContract } from './contracts.js';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.js';

const LIST_CEILING_PROBE = 500;
const LIST_MAX_ITEMS = 200;

liveDescribe('list live contract', () => {
  it('returns exactly ten free games for the top free game collection', async () => {
    const items = (await liveClient.list({
      collection: 'TOP_FREE',
      category: 'GAME',
      num: 10,
    })) as ListItem[];

    expect(items).toHaveLength(10);
    expectAppItemsContract(items, 'top free games');
    for (const item of items) {
      expect(item.free).toBe(true);
      expect(item.price).toBe(0);
    }
  });

  it('fills scores and summaries across one hundred top free games', async () => {
    const items = (await liveClient.list({
      collection: 'TOP_FREE',
      category: 'GAME',
      num: 100,
    })) as ListItem[];

    expect(items).toHaveLength(100);
    expectFieldCoverage('list', items, {
      score: 0.8,
      summary: 0.8,
    });
  });

  it('returns paid applications with a price above zero', async () => {
    const items = (await liveClient.list({
      collection: 'TOP_PAID',
      category: 'APPLICATION',
      num: 5,
    })) as ListItem[];

    expect(items.length).toBeGreaterThan(0);
    expectAppItemsContract(items, 'top paid applications');
    for (const item of items) {
      expect(item.price).toBeGreaterThan(0);
      expect(item.free).toBe(false);
    }
  });

  it('returns paid games for the top paid game collection', async () => {
    const items = (await liveClient.list({
      collection: 'TOP_PAID',
      category: 'GAME',
      num: 5,
    })) as ListItem[];

    expect(items).toHaveLength(5);
    expectAppItemsContract(items, 'top paid games');
    for (const item of items) {
      expect(item.free).toBe(false);
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it('returns five valid apps for the grossing collection', async () => {
    const items = (await liveClient.list({ collection: 'GROSSING', num: 5 })) as ListItem[];

    expect(items).toHaveLength(5);
    expectAppItemsContract(items, 'grossing collection');
  });

  it('returns valid apps across social, productivity, and trivia game categories', async () => {
    const categories = ['SOCIAL', 'PRODUCTIVITY', 'GAME_TRIVIA'] as const;

    for (const category of categories) {
      const items = (await liveClient.list({
        collection: 'TOP_FREE',
        category,
        num: 5,
      })) as ListItem[];

      expect(items.length).toBeGreaterThan(0);
      expectAppItemsContract(items, `${category} top free`);
    }
  });

  it('applies the age filter to the family category', async () => {
    const items = (await liveClient.list({
      collection: 'TOP_FREE',
      category: 'FAMILY',
      age: 'AGE_RANGE1',
      num: 10,
    })) as ListItem[];

    expect(items).toHaveLength(10);
    expectAppItemsContract(items, 'family age filtered');
  });

  it('caps at the google ceiling when num exceeds it', async () => {
    const items = (await liveClient.list({
      collection: 'TOP_FREE',
      category: 'APPLICATION',
      num: LIST_CEILING_PROBE,
    })) as ListItem[];

    expect(items).toHaveLength(LIST_MAX_ITEMS);
    expectAppItemsContract(items, 'list ceiling');
  });
});
