import { expect, it } from 'vitest';
import { sort, type IntegrityEvent } from '../src/index.ts';
import { expectContinuationContract, expectReviewsContract, reviewsAnchor } from './contracts.ts';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.ts';

const TRANSLATE = 'com.google.android.apps.translate';
const GEO_GAME = 'com.adex77.WhereAmI';
const WHATSAPP = 'com.whatsapp';
const EXHAUSTION_PROBE = 5000;
const LOCALIZED_OVERLAP_RATIO = 0.1;

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
});
