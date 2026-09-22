import { expect, it } from 'vitest';
import { type ListItem } from '../src/index.ts';
import { expectAppItemsContract, expectRequestedCountContract } from './contracts.ts';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.ts';

const LIST_CEILING_PROBE = 500;

liveDescribe('list live contract', () => {
  it('returns free games within the requested count for the top free game collection', async () => {
    const num = 10;
    const items = (await liveClient.list({
      collection: 'TOP_FREE',
      category: 'GAME',
      num,
    })) as ListItem[];

    expectRequestedCountContract(items.length, num, 'top free games');
    expectAppItemsContract(items, 'top free games');
    for (const item of items) {
      expect(item.free).toBe(true);
      expect(item.price).toBe(0);
    }
  });

  it('fills scores and summaries across the top free games', async () => {
    const num = 100;
    const items = (await liveClient.list({
      collection: 'TOP_FREE',
      category: 'GAME',
      num,
    })) as ListItem[];

    expectRequestedCountContract(items.length, num, 'top free games coverage');
    expectFieldCoverage('list', items, {
      score: 0.8,
      summary: 0.8,
    });
  });

  it('returns paid applications with a price above zero', async () => {
    const num = 5;
    const items = (await liveClient.list({
      collection: 'TOP_PAID',
      category: 'APPLICATION',
      num,
    })) as ListItem[];

    expectRequestedCountContract(items.length, num, 'top paid applications');
    expectAppItemsContract(items, 'top paid applications');
    for (const item of items) {
      expect(item.price).toBeGreaterThan(0);
      expect(item.free).toBe(false);
    }
  });

  it('returns paid games for the top paid game collection', async () => {
    const num = 5;
    const items = (await liveClient.list({
      collection: 'TOP_PAID',
      category: 'GAME',
      num,
    })) as ListItem[];

    expectRequestedCountContract(items.length, num, 'top paid games');
    expectAppItemsContract(items, 'top paid games');
    for (const item of items) {
      expect(item.free).toBe(false);
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it('returns valid apps for the grossing collection', async () => {
    const num = 5;
    const items = (await liveClient.list({ collection: 'GROSSING', num })) as ListItem[];

    expectRequestedCountContract(items.length, num, 'grossing collection');
    expectAppItemsContract(items, 'grossing collection');
  });

  it('returns valid apps across social, productivity, and trivia game categories', async () => {
    const categories = ['SOCIAL', 'PRODUCTIVITY', 'GAME_TRIVIA'] as const;
    const num = 5;

    for (const category of categories) {
      const items = (await liveClient.list({
        collection: 'TOP_FREE',
        category,
        num,
      })) as ListItem[];

      expectRequestedCountContract(items.length, num, `${category} top free`);
      expectAppItemsContract(items, `${category} top free`);
    }
  });

  it('applies the age filter to the family category', async () => {
    const num = 10;
    const items = (await liveClient.list({
      collection: 'TOP_FREE',
      category: 'FAMILY',
      age: 'AGE_RANGE1',
      num,
    })) as ListItem[];

    expectRequestedCountContract(items.length, num, 'family age filtered');
    expectAppItemsContract(items, 'family age filtered');
  });

  it('serves the whole chart above its depth and exactly num below it', async () => {
    const chart = (await liveClient.list({
      collection: 'TOP_FREE',
      category: 'APPLICATION',
      num: LIST_CEILING_PROBE,
    })) as ListItem[];

    expectRequestedCountContract(chart.length, LIST_CEILING_PROBE, 'list ceiling');
    expectAppItemsContract(chart, 'list ceiling');
    expect(
      chart.length,
      'list ceiling: the chart must hold at least two apps to request a strict part of it',
    ).toBeGreaterThan(1);

    const num = Math.floor(chart.length / 2);
    const part = (await liveClient.list({
      collection: 'TOP_FREE',
      category: 'APPLICATION',
      num,
    })) as ListItem[];

    expect(
      part,
      `list slice: the chart served ${chart.length.toString()} apps, so num ${num.toString()} must reach google and return exactly that many`,
    ).toHaveLength(num);
    expectAppItemsContract(part, 'list slice');
  });
});
