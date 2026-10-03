import { expect, it } from 'vitest';
import { clientFromOptions } from '../src/core/http.ts';
import { app } from '../src/features/app/app.ts';
import {
  createDeveloper,
  fetchDeveloperFirstPage,
  type DeveloperQuery,
} from '../src/features/developer/developer.ts';
import { createDeveloperIterator } from '../src/features/developer/developerIterator.ts';
import { fetchSearchFirstPage, type SearchQuery } from '../src/features/search/search.ts';
import { type DegradationEvent, type IntegrityEvent, type Review } from '../src/index.ts';
import {
  expectAppItemContract,
  expectContinuationContract,
  expectReviewContract,
  expectReviewsContract,
  reviewsAnchor,
} from './contracts.ts';
import { liveClient, liveDescribe, memoizingResolveClient } from './helpers.ts';

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
const GOOGLE_NAME = 'Google LLC';
const NAME_QUERY: DeveloperQuery = {
  devId: GOOGLE_NAME,
  lang: 'en',
  country: 'us',
  throttle: 1,
};
const NAME_CATALOG_PROBE = 500;
const SEARCH_QUERY: SearchQuery = {
  term: SEARCH_STREAM_TERM,
  lang: 'en',
  country: 'us',
  price: 'all',
  throttle: 1,
};
const REVIEWS_ALL_CEILING = 5000;
const BOUNDED_READ = 200;
const STREAM_PAGE_SIZE = 5;
const STREAM_STOP = 3;

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

  it('streams a name developer across the first page and agrees with developer()', async () => {
    const resolveClient = memoizingResolveClient();
    const listDeveloper = createDeveloper(app, resolveClient);
    const streamDeveloper = createDeveloperIterator(resolveClient);
    const { apps, token } = await fetchDeveloperFirstPage(NAME_QUERY, resolveClient);
    const degradations: DegradationEvent[] = [];
    const integrity: IntegrityEvent[] = [];
    const callbacks = {
      onDegradation: (event: DegradationEvent) => degradations.push(event),
      onIntegrityEvent: (event: IntegrityEvent) => integrity.push(event),
    };

    const streamed: string[] = [];
    for await (const item of streamDeveloper({ devId: GOOGLE_NAME, ...callbacks })) {
      expectAppItemContract(item, 'streamed name developer app');
      streamed.push(item.appId);
    }
    const listed = await listDeveloper({
      devId: GOOGLE_NAME,
      num: NAME_CATALOG_PROBE,
      ...callbacks,
    });

    expectContinuationContract(
      { firstPageCount: apps.length, token },
      streamed.length,
      NAME_CATALOG_PROBE,
      'name developer stream',
    );
    expect(streamed, 'the stream and the list must read the same catalogue').toEqual(
      listed.map((item) => item.appId),
    );
    expect(new Set(streamed).size).toBe(streamed.length);
    expect(degradations).toEqual([]);
    expect(integrity).toEqual([]);
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

  it('sizes a bounded reviewsAll read to one request', async () => {
    let requests = 0;

    const reviews: Review[] = await liveClient.reviewsAll({
      appId: WHATSAPP,
      maxReviews: BOUNDED_READ,
      requestOptions: {
        onRequest: () => {
          requests += 1;
        },
      },
    });

    expect(requests).toBe(1);
    expect(reviews).toHaveLength(BOUNDED_READ);
    expectReviewsContract(reviews, 'bounded reviewsAll');
  });

  it('streams filtered reviews in small pages and stops inside the first one', async () => {
    let requests = 0;
    const collected: Review[] = [];

    for await (const review of liveClient.reviewsIterator({
      appId: WHATSAPP,
      score: 5,
      pageSize: STREAM_PAGE_SIZE,
      requestOptions: {
        onRequest: () => {
          requests += 1;
        },
      },
    })) {
      collected.push(review);
      if (collected.length === STREAM_STOP) {
        break;
      }
    }

    expect(requests).toBe(1);
    expect(collected).toHaveLength(STREAM_STOP);
    for (const review of collected) {
      expect(review.score).toBe(5);
    }
    expectReviewsContract(collected, 'filtered stream');
  });
});
