import { expect, it } from 'vitest';
import { device, sort, type Device, type IntegrityEvent, type Review } from '../src/index.ts';
import {
  expectContinuationContract,
  expectRequestedCountContract,
  expectReviewsContract,
  expectSizedRequestFloor,
  reviewsAnchor,
} from './contracts.ts';
import { expectFieldFilledSomewhere, liveClient, liveDescribe } from './helpers.ts';
import { findReviewFilterAnchor, type ReviewFilter } from './reviewAnchors.ts';

const TRANSLATE = 'com.google.android.apps.translate';
const GEO_GAME = 'com.adex77.WhereAmI';
const WHATSAPP = 'com.whatsapp';
const ONE_STAR = 1;
const LEGACY_PROBE = 9000;
const WEAR_OS_LAUNCH = Date.parse('2014-06-25T00:00:00Z');
const EXHAUSTION_PROBE = 5000;
const LOCALIZED_OVERLAP_RATIO = 0.1;
const SMALL_PAGE = 10;
const SIZED_CONTINUATION_NUM = 25;
const MANUAL_PAGE_SIZE = 20;
const FILTER_PAGE_SIZE = 40;
const FULL_WINDOW_PAGE_SIZE = 4500;
const SECONDARY_WINDOW_PAGE_SIZE = 20;
const SUBSET_RATIO = 0.9;
const MINORITY_DEVICES: readonly Device[] = [
  device.TABLET,
  device.WATCH,
  device.CHROMEBOOK,
  device.TV,
];
const SECONDARY_DEVICES: readonly Device[] = [device.TABLET, device.WATCH];
const SCORE_SORTS = [
  { name: 'newest', sort: sort.NEWEST },
  { name: 'rating', sort: sort.RATING },
  { name: 'helpfulness', sort: sort.HELPFULNESS },
] as const;

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

function nthNewestDate(reviews: readonly Review[], depth: number): number {
  const timestamps = reviews
    .map((review) => Date.parse(review.date))
    .sort((left, right) => right - left);
  return timestamps[depth - 1] ?? Number.NaN;
}

function expectOnlyScore(reviews: readonly Review[], score: number, label: string): void {
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

    expectFieldFilledSomewhere('helpfulness sorted reviews', byHelpfulness.data, [
      'text',
      'userImage',
    ]);
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

    expectSizedRequestFloor(counter.count(), result.data.length, SMALL_PAGE, 'sized continuation');

    expectRequestedCountContract(result.data.length, SIZED_CONTINUATION_NUM, 'sized continuation');
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

    expectRequestedCountContract(first.data.length, MANUAL_PAGE_SIZE, 'manual page size page one');
    expectRequestedCountContract(second.data.length, MANUAL_PAGE_SIZE, 'manual page size page two');
    expect(sharedIds(second.data, first.data)).toBe(0);
    expectReviewsContract([...first.data, ...second.data], 'manual page size');
  });

  it.for(SCORE_SORTS)(
    'returns only one star reviews across two $name sorted pages',
    async ({ name, sort: sortValue }, { annotate }) => {
      const events: IntegrityEvent[] = [];
      const label = `${name} score filter`;
      const filter: ReviewFilter = {
        sort: sortValue,
        score: ONE_STAR,
        pageSize: MANUAL_PAGE_SIZE,
        onIntegrityEvent: (event) => events.push(event),
      };
      const anchor = await findReviewFilterAnchor(filter, label);
      const first = anchor.page.data;
      const second = await liveClient.reviews({
        appId: anchor.appId,
        paginate: true,
        nextPaginationToken: anchor.token,
        ...filter,
      });

      expectOnlyScore(first, ONE_STAR, `${label} page one`);
      expectOnlyScore(second.data, ONE_STAR, `${label} page two`);
      expectReviewsContract([...first, ...second.data], label);
      expect(sharedIds(second.data, first)).toBe(0);
      expect(events).toEqual([]);
      await annotate(
        `${label}: ${anchor.appId} served ${second.data.length.toString()} reviews on page two`,
        'notice',
      );
    },
  );

  it.for(SECONDARY_DEVICES)(
    'excludes %s reviews from the mobile filter inside the unfiltered window',
    async (deviceName, { annotate }) => {
      const label = `${deviceName} filter`;
      const anchor = await findReviewFilterAnchor(
        { device: deviceName, pageSize: SECONDARY_WINDOW_PAGE_SIZE },
        label,
      );
      const unfiltered = await liveClient.reviews({
        appId: anchor.appId,
        paginate: true,
        pageSize: FULL_WINDOW_PAGE_SIZE,
      });
      const mobile = await liveClient.reviews({
        appId: anchor.appId,
        paginate: true,
        device: device.MOBILE,
        pageSize: FULL_WINDOW_PAGE_SIZE,
      });
      const secondary = anchor.page.data;
      const windowStart = Math.max(oldestDate(unfiltered.data), oldestDate(mobile.data));
      const insideWindow = secondary.filter((review) => Date.parse(review.date) >= windowStart);

      expect(
        unfiltered.data.length,
        `${label}: the unfiltered window of ${anchor.appId} is empty`,
      ).toBeGreaterThan(0);
      expectReviewsContract(secondary, label);
      expect(
        sharedIds(secondary, mobile.data),
        `${label}: a ${deviceName} review of ${anchor.appId} leaked into the mobile stream`,
      ).toBe(0);
      if (insideWindow.length === 0) {
        await annotate(
          `${label}: none of the ${secondary.length.toString()} ${anchor.appId} reviews sits inside the window of ${unfiltered.data.length.toString()} unfiltered and ${mobile.data.length.toString()} mobile reviews, subset check skipped`,
          'notice',
        );
        return;
      }
      expect(
        sharedIds(insideWindow, unfiltered.data),
        `${label}: its reviews inside the window must be part of the unfiltered stream`,
      ).toBeGreaterThanOrEqual(insideWindow.length * SUBSET_RATIO);
    },
  );

  it('dates any unrated review behind the watch filter before Wear OS', async ({ annotate }) => {
    const label = 'watch legacy reviews';
    const anchor = await findReviewFilterAnchor(
      { device: device.WATCH, pageSize: FILTER_PAGE_SIZE },
      label,
    );
    const watch = await liveClient.reviews({
      appId: anchor.appId,
      device: device.WATCH,
      num: LEGACY_PROBE,
    });
    const unrated = watch.data.filter((review) => review.score === 0);

    expectReviewsContract(watch.data, label);
    for (const review of unrated) {
      expect(
        Date.parse(review.date),
        `${label}: unrated review ${review.id} of ${anchor.appId} is not a pre Wear OS legacy review`,
      ).toBeLessThan(WEAR_OS_LAUNCH);
    }
    await annotate(
      `${label}: ${unrated.length.toString()} unrated legacy reviews among ${watch.data.length.toString()} served by ${anchor.appId}`,
      'notice',
    );
  });

  it.for(MINORITY_DEVICES)(
    'reaches further back than the unfiltered stream for %s and keeps the filter on page two',
    async (deviceName, { annotate }) => {
      const label = `${deviceName} filter`;
      const anchor = await findReviewFilterAnchor(
        { device: deviceName, pageSize: FILTER_PAGE_SIZE },
        label,
      );
      const first = anchor.page.data;
      const unfiltered = await liveClient.reviews({
        appId: anchor.appId,
        paginate: true,
        pageSize: FILTER_PAGE_SIZE,
      });
      const second = await liveClient.reviews({
        appId: anchor.appId,
        paginate: true,
        device: deviceName,
        pageSize: FILTER_PAGE_SIZE,
        nextPaginationToken: anchor.token,
      });

      expect(
        unfiltered.data.length,
        `${label}: the unfiltered page of ${anchor.appId} is empty`,
      ).toBeGreaterThan(0);
      expectReviewsContract([...first, ...second.data], label);
      const depth = Math.min(first.length, unfiltered.data.length);
      expect(
        nthNewestDate(first, depth),
        `${label}: the ${depth.toString()} newest ${deviceName} reviews of ${anchor.appId} must reach further back than its ${depth.toString()} newest unfiltered ones, an equal date means google ignored the device filter`,
      ).toBeLessThan(nthNewestDate(unfiltered.data, depth));
      expect(
        newestDate(second.data),
        `${label}: page two must continue older than page one`,
      ).toBeLessThanOrEqual(oldestDate(first));
      await annotate(
        `${label}: ${anchor.appId} served ${second.data.length.toString()} reviews on page two`,
        'notice',
      );
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
      score: ONE_STAR,
      num: EXHAUSTION_PROBE,
      onIntegrityEvent: (event) => events.push(event),
      requestOptions: { onRequest: counter.onRequest },
    });

    expect(counter.count()).toBe(1);
    expect(
      result.data.length,
      'small catalog one star: the owned listing carries one star reviews',
    ).toBeGreaterThan(0);
    expectOnlyScore(result.data, ONE_STAR, 'small catalog one star');
    expect(result.data.length).toBeLessThan(EXHAUSTION_PROBE);
    expect(result.nextPaginationToken).toBeNull();
    expect(events).toEqual([]);
  });
});
