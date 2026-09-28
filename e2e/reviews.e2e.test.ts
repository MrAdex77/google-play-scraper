import { expect, it } from 'vitest';
import { device, sort, type Device, type IntegrityEvent, type Review } from '../src/index.ts';
import { expectContinuationContract, expectReviewsContract, reviewsAnchor } from './contracts.ts';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.ts';

const TRANSLATE = 'com.google.android.apps.translate';
const GEO_GAME = 'com.adex77.WhereAmI';
const WHATSAPP = 'com.whatsapp';
const EXHAUSTION_PROBE = 5000;
const LOCALIZED_OVERLAP_RATIO = 0.1;
const SMALL_PAGE = 10;
const SIZED_CONTINUATION_NUM = 25;
const MANUAL_PAGE_SIZE = 20;
const FILTER_PAGE_SIZE = 40;
const FULL_WINDOW_PAGE_SIZE = 4500;
const TABLET_WINDOW_PAGE_SIZE = 20;
const SUBSET_RATIO = 0.9;
const MINORITY_DEVICES: readonly Device[] = [device.TABLET, device.CHROMEBOOK, device.TV];

function requestCounter(): { onRequest: () => void; count: () => number } {
  let requests = 0;
  return {
    onRequest: () => {
      requests += 1;
    },
    count: () => requests,
  };
}

function ids(reviews: readonly Review[]): Set<string> {
  return new Set(reviews.map((review) => review.id));
}

function sharedIds(left: readonly Review[], right: readonly Review[]): number {
  const rightIds = ids(right);
  return left.filter((review) => rightIds.has(review.id)).length;
}

function oldestDate(reviews: readonly Review[]): number {
  return Math.min(...reviews.map((review) => Date.parse(review.date)));
}

function newestDate(reviews: readonly Review[]): number {
  return Math.max(...reviews.map((review) => Date.parse(review.date)));
}

function expectOnlyScore(reviews: readonly Review[], score: number, label: string): void {
  expect(reviews.length, `${label}: the filtered page served no reviews`).toBeGreaterThan(0);
  for (const review of reviews) {
    expect(review.score, `${label}: review ${review.id} escaped the score filter`).toBe(score);
  }
}

function tokenOf(page: { nextPaginationToken: string | null }, label: string): string {
  const token = page.nextPaginationToken;
  if (token === null) {
    throw new Error(`${label}: expected a pagination token`);
  }
  return token;
}

liveDescribe('reviews live contract', () => {
  it('returns a valid first page for the Where Am I geography game', async () => {
    const result = await liveClient.reviews({ appId: GEO_GAME, paginate: true });

    expect(result.data.length).toBeGreaterThan(0);
    expectReviewsContract(result.data, 'geography game reviews');
  });

  it('accumulates exactly one review past the live first page with unique ids', async () => {
    const events: IntegrityEvent[] = [];
    const anchor = reviewsAnchor(
      await liveClient.reviews({ appId: TRANSLATE, paginate: true }),
      'accumulated reviews',
    );
    const num = anchor.firstPageCount + 1;
    const result = await liveClient.reviews({
      appId: TRANSLATE,
      num,
      onIntegrityEvent: (event) => events.push(event),
    });

    expectContinuationContract(anchor, result.data.length, num, 'accumulated reviews');
    expect(result.nextPaginationToken).toBeNull();
    expectReviewsContract(result.data, 'accumulated reviews');
    expect(events).toEqual([]);
  });

  it('walks two manual pages that surface different first reviews', async () => {
    const firstPage = await liveClient.reviews({ appId: TRANSLATE, paginate: true });
    expect(firstPage.nextPaginationToken).not.toBeNull();

    const token = firstPage.nextPaginationToken;
    if (token === null) {
      throw new Error('expected a pagination token on the first page');
    }

    const secondPage = await liveClient.reviews({
      appId: TRANSLATE,
      paginate: true,
      nextPaginationToken: token,
    });

    expect(firstPage.data[0]?.id).not.toBe(secondPage.data[0]?.id);
  });

  it('returns valid pages for the rating and helpfulness sort orders', async () => {
    const byRating = await liveClient.reviews({
      appId: TRANSLATE,
      sort: sort.RATING,
      paginate: true,
    });
    const byHelpfulness = await liveClient.reviews({
      appId: TRANSLATE,
      sort: sort.HELPFULNESS,
      paginate: true,
    });

    expect(byRating.data.length).toBeGreaterThan(0);
    expect(byHelpfulness.data.length).toBeGreaterThan(0);
    expectReviewsContract(byRating.data, 'rating sorted reviews');
    expectReviewsContract(byHelpfulness.data, 'helpfulness sorted reviews');

    expectFieldCoverage('reviews', byHelpfulness.data, {
      text: 0.8,
      userImage: 0.8,
    });
  });

  it('returns the newest sort in non increasing date order', async () => {
    const result = await liveClient.reviews({ appId: WHATSAPP, paginate: true });

    expect(
      result.data.length,
      'newest sorted reviews: an order needs at least two reviews to compare',
    ).toBeGreaterThan(1);
    expectReviewsContract(result.data, 'newest sorted reviews');
    const timestamps = result.data.map((review) => Date.parse(review.date));
    for (const [index, timestamp] of timestamps.entries()) {
      if (index > 0) {
        expect(timestamp).toBeLessThanOrEqual(timestamps[index - 1]!);
      }
    }
  });

  it('serves a disjoint localized first page for a polish storefront', async () => {
    const defaultPage = await liveClient.reviews({ appId: WHATSAPP, paginate: true });
    const polishPage = await liveClient.reviews({
      appId: WHATSAPP,
      paginate: true,
      lang: 'pl',
      country: 'pl',
    });

    expect(defaultPage.data.length).toBeGreaterThan(0);
    expect(polishPage.data.length).toBeGreaterThan(0);
    expect(polishPage.nextPaginationToken).not.toBeNull();
    expectReviewsContract(polishPage.data, 'polish storefront reviews');

    const defaultIds = new Set(defaultPage.data.map((review) => review.id));
    const overlap = polishPage.data.filter((review) => defaultIds.has(review.id)).length;
    expect(
      overlap,
      `polish storefront reviews: ${overlap.toString()} of ${polishPage.data.length.toString()} reviews also appear on the default storefront`,
    ).toBeLessThan(polishPage.data.length * LOCALIZED_OVERLAP_RATIO);
  });

  it('returns an empty page instead of throwing for a missing app', async () => {
    const result = await liveClient.reviews({
      appId: 'com.adex77.definitely.not.a.real.app',
      num: 10,
    });

    expect(result.data).toEqual([]);
    expect(result.nextPaginationToken).toBeNull();
  });

  it('returns every available review and stops when num exceeds the total', async () => {
    const result = await liveClient.reviews({ appId: GEO_GAME, num: EXHAUSTION_PROBE });

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.length).toBeLessThan(EXHAUSTION_PROBE);
    expect(result.nextPaginationToken).toBeNull();
    expectReviewsContract(result.data, 'exhausted reviews');
  });

  it('sizes a ten review fetch to exactly one request of ten', async () => {
    const counter = requestCounter();

    const result = await liveClient.reviews({
      appId: TRANSLATE,
      num: SMALL_PAGE,
      requestOptions: { onRequest: counter.onRequest },
    });

    expect(counter.count()).toBe(1);
    expect(result.data).toHaveLength(SMALL_PAGE);
    expect(result.nextPaginationToken).toBeNull();
    expectReviewsContract(result.data, 'ten review fetch');
  });

  it('follows continuations sized to the remaining count under an explicit pageSize', async () => {
    const counter = requestCounter();
    const events: IntegrityEvent[] = [];

    const result = await liveClient.reviews({
      appId: TRANSLATE,
      num: SIZED_CONTINUATION_NUM,
      pageSize: SMALL_PAGE,
      onIntegrityEvent: (event) => events.push(event),
      requestOptions: { onRequest: counter.onRequest },
    });

    expect(counter.count()).toBe(Math.ceil(SIZED_CONTINUATION_NUM / SMALL_PAGE));
    expect(result.data).toHaveLength(SIZED_CONTINUATION_NUM);
    expectReviewsContract(result.data, 'sized continuation');
    expect(events).toEqual([]);
  });

  it('honours an explicit page size on manual pages and continues onto a disjoint page', async () => {
    const first = await liveClient.reviews({
      appId: TRANSLATE,
      paginate: true,
      pageSize: MANUAL_PAGE_SIZE,
    });
    const second = await liveClient.reviews({
      appId: TRANSLATE,
      paginate: true,
      pageSize: MANUAL_PAGE_SIZE,
      nextPaginationToken: tokenOf(first, 'manual page size'),
    });

    expect(first.data).toHaveLength(MANUAL_PAGE_SIZE);
    expect(second.data).toHaveLength(MANUAL_PAGE_SIZE);
    expect(sharedIds(second.data, first.data)).toBe(0);
    expectReviewsContract([...first.data, ...second.data], 'manual page size');
  });

  it.each([
    { name: 'newest', sort: sort.NEWEST },
    { name: 'rating', sort: sort.RATING },
    { name: 'helpfulness', sort: sort.HELPFULNESS },
  ])(
    'returns only one star reviews across two $name sorted pages',
    async ({ name, sort: sortValue }) => {
      const events: IntegrityEvent[] = [];
      const label = `${name} score filter`;
      const first = await liveClient.reviews({
        appId: WHATSAPP,
        paginate: true,
        sort: sortValue,
        score: 1,
        pageSize: MANUAL_PAGE_SIZE,
        onIntegrityEvent: (event) => events.push(event),
      });
      const second = await liveClient.reviews({
        appId: WHATSAPP,
        paginate: true,
        sort: sortValue,
        score: 1,
        pageSize: MANUAL_PAGE_SIZE,
        nextPaginationToken: tokenOf(first, label),
        onIntegrityEvent: (event) => events.push(event),
      });

      expectOnlyScore(first.data, 1, `${label} page one`);
      expectOnlyScore(second.data, 1, `${label} page two`);
      expectReviewsContract([...first.data, ...second.data], label);
      expect(sharedIds(second.data, first.data)).toBe(0);
      expect(events).toEqual([]);
    },
  );

  it('excludes tablet reviews from the mobile filter inside an overlapping time window', async () => {
    const unfiltered = await liveClient.reviews({
      appId: WHATSAPP,
      paginate: true,
      pageSize: FULL_WINDOW_PAGE_SIZE,
    });
    const mobile = await liveClient.reviews({
      appId: WHATSAPP,
      paginate: true,
      device: device.MOBILE,
      pageSize: FULL_WINDOW_PAGE_SIZE,
    });
    const tablet = await liveClient.reviews({
      appId: WHATSAPP,
      paginate: true,
      device: device.TABLET,
      pageSize: TABLET_WINDOW_PAGE_SIZE,
    });

    expect(tablet.data.length, 'tablet filter: no tablet reviews served').toBeGreaterThan(0);
    expectReviewsContract(tablet.data, 'tablet filter');
    expect(
      newestDate(tablet.data),
      'tablet filter: the newest tablet review must fall inside the mobile window for the exclusion to mean anything',
    ).toBeGreaterThanOrEqual(oldestDate(mobile.data));
    expect(
      sharedIds(tablet.data, unfiltered.data),
      'tablet filter: tablet reviews must be part of the unfiltered stream',
    ).toBeGreaterThanOrEqual(tablet.data.length * SUBSET_RATIO);
    expect(
      sharedIds(tablet.data, mobile.data),
      'mobile filter: a tablet review leaked into the mobile stream',
    ).toBe(0);
  });

  it.each(MINORITY_DEVICES)(
    'reaches further back than the unfiltered stream for %s and keeps the filter on page two',
    async (deviceName) => {
      const label = `${deviceName} filter`;
      const unfiltered = await liveClient.reviews({
        appId: WHATSAPP,
        paginate: true,
        pageSize: FILTER_PAGE_SIZE,
      });
      const first = await liveClient.reviews({
        appId: WHATSAPP,
        paginate: true,
        device: deviceName,
        pageSize: FILTER_PAGE_SIZE,
      });
      const second = await liveClient.reviews({
        appId: WHATSAPP,
        paginate: true,
        device: deviceName,
        pageSize: FILTER_PAGE_SIZE,
        nextPaginationToken: tokenOf(first, label),
      });

      expect(first.data.length, `${label}: page one is empty`).toBeGreaterThan(0);
      expect(second.data.length, `${label}: page two is empty`).toBeGreaterThan(0);
      expectReviewsContract([...first.data, ...second.data], label);
      expect(
        oldestDate(first.data),
        `${label}: a filtered page of ${FILTER_PAGE_SIZE.toString()} must reach further back than an unfiltered one`,
      ).toBeLessThan(oldestDate(unfiltered.data));
      expect(
        newestDate(second.data),
        `${label}: page two must continue older than page one`,
      ).toBeLessThanOrEqual(oldestDate(first.data));
    },
  );

  it('returns a typed empty result for a missing app under a score filter', async () => {
    const result = await liveClient.reviews({
      appId: 'com.adex77.definitely.not.a.real.app',
      score: 5,
      num: SMALL_PAGE,
    });

    expect(result.data).toEqual([]);
    expect(result.nextPaginationToken).toBeNull();
  });

  it('exhausts the one star reviews of the owned small catalog app in one filtered request', async () => {
    const counter = requestCounter();
    const events: IntegrityEvent[] = [];

    const result = await liveClient.reviews({
      appId: GEO_GAME,
      score: 1,
      num: EXHAUSTION_PROBE,
      onIntegrityEvent: (event) => events.push(event),
      requestOptions: { onRequest: counter.onRequest },
    });

    expect(counter.count()).toBe(1);
    expectOnlyScore(result.data, 1, 'small catalog one star');
    expect(result.data.length).toBeLessThan(EXHAUSTION_PROBE);
    expect(result.nextPaginationToken).toBeNull();
    expect(events).toEqual([]);
  });
});
