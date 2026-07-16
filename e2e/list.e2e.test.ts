import { expect, it } from 'vitest';
import { type ListItem } from '../src/index.js';
import { liveClient, liveDescribe } from './helpers.js';

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
});
