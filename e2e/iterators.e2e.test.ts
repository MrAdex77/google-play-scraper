import { expect, it } from 'vitest';
import { liveClient, liveDescribe } from './helpers.js';

const WHATSAPP = 'com.whatsapp';
const FIRST_PAGE_SIZE = 150;

liveDescribe('iterators live contract', () => {
  it('streams reviews across the first page boundary', async () => {
    const collected: string[] = [];
    for await (const review of liveClient.reviewsIterator({ appId: WHATSAPP })) {
      expect(review.id.length).toBeGreaterThan(0);
      expect(review.userName.length).toBeGreaterThan(0);
      expect(review.score).toBeGreaterThanOrEqual(1);
      expect(review.score).toBeLessThanOrEqual(5);
      expect(Number.isNaN(Date.parse(review.date))).toBe(false);
      collected.push(review.id);
      if (collected.length === 200) {
        break;
      }
    }

    expect(collected).toHaveLength(200);
    expect(collected.length).toBeGreaterThan(FIRST_PAGE_SIZE);
    expect(new Set(collected).size).toBe(200);
  });

  it('streams thirty search results for a broad term and stops', async () => {
    const collected: string[] = [];
    for await (const result of liveClient.searchIterator({ term: 'geography quiz' })) {
      expect(result.appId.length).toBeGreaterThan(0);
      expect(result.title.length).toBeGreaterThan(0);
      expect(result.url.startsWith('https://play.google.com')).toBe(true);
      collected.push(result.appId);
      if (collected.length === 30) {
        break;
      }
    }

    expect(collected).toHaveLength(30);
    expect(new Set(collected).size).toBe(30);
  });

  it('streams developer apps across the first page boundary', async () => {
    const collected: string[] = [];
    for await (const item of liveClient.developerIterator({ devId: '5700313618786177705' })) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(item.url.startsWith('https://play.google.com')).toBe(true);
      collected.push(item.appId);
      if (collected.length === 40) {
        break;
      }
    }

    expect(collected).toHaveLength(40);
    expect(new Set(collected).size).toBe(40);
  });

  it('drains the search stream without hanging when google stops paginating', async () => {
    const collected: string[] = [];
    for await (const result of liveClient.searchIterator({ term: 'panda' })) {
      expect(result.appId.length).toBeGreaterThan(0);
      collected.push(result.appId);
    }

    expect(collected.length).toBeGreaterThanOrEqual(15);
    expect(new Set(collected).size).toBe(collected.length);
  });

  it('collects exactly maxReviews reviews through reviewsAll', async () => {
    const reviews = await liveClient.reviewsAll({ appId: WHATSAPP, maxReviews: 50 });

    expect(reviews).toHaveLength(50);
    for (const review of reviews) {
      expect(review.score).toBeGreaterThanOrEqual(1);
      expect(review.score).toBeLessThanOrEqual(5);
      expect(Number.isNaN(Date.parse(review.date))).toBe(false);
    }
  });
});
