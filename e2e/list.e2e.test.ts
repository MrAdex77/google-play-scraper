import { expect, it } from 'vitest';
import { type ListItem } from '../src/index.js';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.js';

const assertValidItem = (item: ListItem): void => {
  expect(item.appId.length).toBeGreaterThan(0);
  expect(item.title.length).toBeGreaterThan(0);
  expect(new URL(item.url).origin).toBe('https://play.google.com');
  expect(typeof item.price).toBe('number');
  expect(typeof item.free).toBe('boolean');
  if (item.score !== undefined) {
    expect(item.score).toBeGreaterThanOrEqual(0);
    expect(item.score).toBeLessThanOrEqual(5);
  }
};

liveDescribe('list live contract', () => {
  it('returns exactly ten free games for the top free game collection', async () => {
    const items = (await liveClient.list({
      collection: 'TOP_FREE',
      category: 'GAME',
      num: 10,
    })) as ListItem[];

    expect(items).toHaveLength(10);
    for (const item of items) {
      assertValidItem(item);
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
    for (const item of items) {
      assertValidItem(item);
      expect(item.price).toBeGreaterThan(0);
      expect(item.free).toBe(false);
    }
  });

  it('returns five valid apps for the grossing collection', async () => {
    const items = (await liveClient.list({ collection: 'GROSSING', num: 5 })) as ListItem[];

    expect(items).toHaveLength(5);
    for (const item of items) {
      assertValidItem(item);
    }
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
      for (const item of items) {
        assertValidItem(item);
      }
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
    for (const item of items) {
      assertValidItem(item);
    }
  });

  it('caps at the google ceiling when num exceeds it', async () => {
    const items = (await liveClient.list({
      collection: 'TOP_FREE',
      category: 'APPLICATION',
      num: 500,
    })) as ListItem[];

    expect(items.length).toBeGreaterThanOrEqual(150);
    expect(items.length).toBeLessThanOrEqual(500);
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);
  });
});
