import { expect, it } from 'vitest';
import { sort, type IntegrityEvent } from '../src/index.js';
import { expectReviewsContract } from './contracts.js';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.js';

const TRANSLATE = 'com.google.android.apps.translate';
const GEO_GAME = 'com.adex77.WhereAmI';
const WHATSAPP = 'com.whatsapp';
const REVIEW_PAGE_FLOOR = 100;
const ACCUMULATED_NUM = 320;
const EXHAUSTION_PROBE = 5000;
const LOCALIZED_OVERLAP_CEILING = 15;

liveDescribe('reviews live contract', () => {
  it('returns a valid first page for the Where Am I geography game', async () => {
    const result = await liveClient.reviews({ appId: GEO_GAME, paginate: true });

    expect(result.data.length).toBeGreaterThan(0);
    expectReviewsContract(result.data, 'geography game reviews');
  });

  it('accumulates exactly the requested number of reviews with unique ids', async () => {
    const events: IntegrityEvent[] = [];
    const result = await liveClient.reviews({
      appId: TRANSLATE,
      num: ACCUMULATED_NUM,
      onIntegrityEvent: (event) => events.push(event),
    });

    expect(result.data).toHaveLength(ACCUMULATED_NUM);
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

    expect(result.data.length).toBeGreaterThan(REVIEW_PAGE_FLOOR);
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

    expect(polishPage.data.length).toBeGreaterThan(REVIEW_PAGE_FLOOR);
    expect(polishPage.nextPaginationToken).not.toBeNull();
    expectReviewsContract(polishPage.data, 'polish storefront reviews');

    const defaultIds = new Set(defaultPage.data.map((review) => review.id));
    const overlap = polishPage.data.filter((review) => defaultIds.has(review.id)).length;
    expect(overlap).toBeLessThan(LOCALIZED_OVERLAP_CEILING);
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
});
