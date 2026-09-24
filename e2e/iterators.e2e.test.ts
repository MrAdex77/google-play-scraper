import { expect, it } from 'vitest';
import { clientFromOptions } from '../src/core/http.ts';
import {
  fetchDeveloperFirstPage,
  type DeveloperQuery,
} from '../src/features/developer/developer.ts';
import { fetchSearchFirstPage, type SearchQuery } from '../src/features/search/search.ts';
import { type DegradationEvent, type IntegrityEvent, type Review } from '../src/index.ts';
import {
  expectAppItemContract,
  expectContinuationContract,
  expectReviewContract,
  expectReviewsContract,
  reviewsAnchor,
} from './contracts.ts';
import { liveClient, liveDescribe } from './helpers.ts';

const WHATSAPP = 'com.whatsapp';
const GEO_GAME = 'com.adex77.WhereAmI';
const GOOGLE_DEV_ID = '5700313618786177705';
const SEARCH_STREAM_TERM = 'geography quiz';
const DEVELOPER_QUERY: DeveloperQuery = {
  devId: GOOGLE_DEV_ID,
  lang: 'en',
  country: 'us',
  throttle: 1,
};
const SEARCH_QUERY: SearchQuery = {
  term: SEARCH_STREAM_TERM,
  lang: 'en',
  country: 'us',
  price: 'all',
  throttle: 1,
};
const REVIEWS_ALL_CEILING = 5000;

liveDescribe('iterators live contract', () => {
  it('streams reviews across the first page boundary', async () => {
    const anchor = reviewsAnchor(
      await liveClient.reviews({ appId: WHATSAPP, paginate: true }),
      'reviews stream',
    );
    const limit = anchor.firstPageCount + 1;
    const collected: string[] = [];
    const events: IntegrityEvent[] = [];
    for await (const review of liveClient.reviewsIterator({
      appId: WHATSAPP,
      onIntegrityEvent: (event) => events.push(event),
    })) {
      expectReviewContract(review, 'streamed review');
      collected.push(review.id);
      if (collected.length === limit) {
        break;
      }
    }

    expectContinuationContract(anchor, collected.length, limit, 'reviews stream');
    expect(new Set(collected).size).toBe(collected.length);
    expect(events).toEqual([]);
  });

  it('stops one result short of the search first page', async () => {
    const { page } = await fetchSearchFirstPage(SEARCH_QUERY, clientFromOptions);
    expect(
      page.apps.length,
      'the search first page must carry more than one result to break inside it',
    ).toBeGreaterThan(1);
    const limit = page.apps.length - 1;

    const collected: string[] = [];
    for await (const result of liveClient.searchIterator({ term: SEARCH_STREAM_TERM })) {
      expectAppItemContract(result, 'streamed search result');
      collected.push(result.appId);
      if (collected.length === limit) {
        break;
      }
    }

    expect(
      collected,
      'the search stream must yield every result up to the caller break',
    ).toHaveLength(limit);
    expect(new Set(collected).size).toBe(limit);
  });

  it('streams developer apps across the first page boundary', async () => {
    const { apps, token } = await fetchDeveloperFirstPage(DEVELOPER_QUERY, clientFromOptions);
    const limit = apps.length + 1;
    const collected: string[] = [];
    const events: DegradationEvent[] = [];
    for await (const item of liveClient.developerIterator({
      devId: GOOGLE_DEV_ID,
      onDegradation: (event) => events.push(event),
    })) {
      expectAppItemContract(item, 'streamed developer app');
      collected.push(item.appId);
      if (collected.length === limit) {
        break;
      }
    }

    expectContinuationContract(
      { firstPageCount: apps.length, token },
      collected.length,
      limit,
      'developer stream',
    );
    expect(new Set(collected).size).toBe(collected.length);
    expect(events).toEqual([]);
  });

  it('drains the search stream without hanging when google stops paginating', async () => {
    const collected: string[] = [];
    for await (const result of liveClient.searchIterator({ term: 'panda' })) {
      expect(result.appId.length).toBeGreaterThan(0);
      collected.push(result.appId);
    }

    expect(collected.length, 'the drained search stream must yield results').toBeGreaterThan(0);
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

  it('collects exactly maxReviews reviews one short of the live first page', async () => {
    const { firstPageCount } = reviewsAnchor(
      await liveClient.reviews({ appId: WHATSAPP, paginate: true }),
      'reviewsAll page',
    );
    expect(
      firstPageCount,
      'the reviews first page must carry more than one review to stop inside it',
    ).toBeGreaterThan(1);
    const maxReviews = firstPageCount - 1;

    const reviews: Review[] = await liveClient.reviewsAll({ appId: WHATSAPP, maxReviews });

    expect(reviews).toHaveLength(maxReviews);
    expectReviewsContract(reviews, 'reviewsAll page');
  });

  it('drains reviewsAll without maxReviews on a small catalog app', async () => {
    const reviews: Review[] = await liveClient.reviewsAll({ appId: GEO_GAME });

    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.length).toBeLessThan(REVIEWS_ALL_CEILING);
    expectReviewsContract(reviews, 'drained reviewsAll');
  });
});
