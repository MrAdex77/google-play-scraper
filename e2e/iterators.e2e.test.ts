import { expect, it } from 'vitest';
import { type DegradationEvent, type IntegrityEvent, type Review } from '../src/index.js';
import { expectAppItemContract, expectReviewContract, expectReviewsContract } from './contracts.js';
import { liveClient, liveDescribe } from './helpers.js';

const WHATSAPP = 'com.whatsapp';
const GEO_GAME = 'com.adex77.WhereAmI';
const FIRST_PAGE_SIZE = 150;
const STREAM_LIMIT = 200;
const SEARCH_STREAM_LIMIT = 30;
const DEVELOPER_STREAM_LIMIT = 40;
const REVIEWS_ALL_LIMIT = 50;
const REVIEWS_ALL_CEILING = 5000;

liveDescribe('iterators live contract', () => {
  it('streams reviews across the first page boundary', async () => {
    const collected: string[] = [];
    const events: IntegrityEvent[] = [];
    for await (const review of liveClient.reviewsIterator({
      appId: WHATSAPP,
      onIntegrityEvent: (event) => events.push(event),
    })) {
      expectReviewContract(review, 'streamed review');
      collected.push(review.id);
      if (collected.length === STREAM_LIMIT) {
        break;
      }
    }

    expect(collected).toHaveLength(STREAM_LIMIT);
    expect(collected.length).toBeGreaterThan(FIRST_PAGE_SIZE);
    expect(new Set(collected).size).toBe(STREAM_LIMIT);
    expect(events).toEqual([]);
  });

  it('streams thirty search results for a broad term and stops', async () => {
    const collected: string[] = [];
    for await (const result of liveClient.searchIterator({ term: 'geography quiz' })) {
      expectAppItemContract(result, 'streamed search result');
      collected.push(result.appId);
      if (collected.length === SEARCH_STREAM_LIMIT) {
        break;
      }
    }

    expect(collected).toHaveLength(SEARCH_STREAM_LIMIT);
    expect(new Set(collected).size).toBe(SEARCH_STREAM_LIMIT);
  });

  it('streams developer apps across the first page boundary', async () => {
    const collected: string[] = [];
    const events: DegradationEvent[] = [];
    for await (const item of liveClient.developerIterator({
      devId: '5700313618786177705',
      onDegradation: (event) => events.push(event),
    })) {
      expectAppItemContract(item, 'streamed developer app');
      collected.push(item.appId);
      if (collected.length === DEVELOPER_STREAM_LIMIT) {
        break;
      }
    }

    expect(collected).toHaveLength(DEVELOPER_STREAM_LIMIT);
    expect(new Set(collected).size).toBe(DEVELOPER_STREAM_LIMIT);
    expect(events).toEqual([]);
  });

  it('drains the search stream without hanging when google stops paginating', async () => {
    const collected: string[] = [];
    for await (const result of liveClient.searchIterator({ term: 'panda' })) {
      expect(result.appId.length).toBeGreaterThan(0);
      collected.push(result.appId);
    }

    expect(collected.length).toBeGreaterThanOrEqual(10);
    expect(new Set(collected).size).toBe(collected.length);
  });

  it('terminates the reviews stream without items for a missing app', async () => {
    const collected: string[] = [];
    for await (const review of liveClient.reviewsIterator({
      appId: 'com.adex77.definitely.not.a.real.app',
    })) {
      collected.push(review.id);
    }

    expect(collected).toEqual([]);
  });

  it('collects exactly maxReviews reviews through reviewsAll', async () => {
    const reviews: Review[] = await liveClient.reviewsAll({
      appId: WHATSAPP,
      maxReviews: REVIEWS_ALL_LIMIT,
    });

    expect(reviews).toHaveLength(REVIEWS_ALL_LIMIT);
    expectReviewsContract(reviews, 'reviewsAll page');
  });

  it('drains reviewsAll without maxReviews on a small catalog app', async () => {
    const reviews: Review[] = await liveClient.reviewsAll({ appId: GEO_GAME });

    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.length).toBeLessThan(REVIEWS_ALL_CEILING);
    expectReviewsContract(reviews, 'drained reviewsAll');
  });
});
