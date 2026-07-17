import { expect, it } from 'vitest';
import { sort } from '../src/index.js';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.js';

const TRANSLATE = 'com.google.android.apps.translate';

liveDescribe('reviews live contract', () => {
  it('returns a valid first page for the Where Am I geography game', async () => {
    const result = await liveClient.reviews({ appId: 'com.adex77.WhereAmI', paginate: true });

    expect(result.data.length).toBeGreaterThan(0);
    for (const review of result.data) {
      expect(review.id.length).toBeGreaterThan(0);
      expect(review.userName.length).toBeGreaterThan(0);
      expect(review.score).toBeGreaterThanOrEqual(1);
      expect(review.score).toBeLessThanOrEqual(5);
      expect(Number.isNaN(Date.parse(review.date))).toBe(false);
    }
  });

  it('accumulates exactly the requested number of reviews with unique ids', async () => {
    const result = await liveClient.reviews({ appId: TRANSLATE, num: 320 });

    expect(result.data).toHaveLength(320);
    expect(result.nextPaginationToken).toBeNull();
    expect(new Set(result.data.map((review) => review.id)).size).toBe(320);
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
    for (const review of [...byRating.data, ...byHelpfulness.data]) {
      expect(review.score).toBeGreaterThanOrEqual(1);
      expect(review.score).toBeLessThanOrEqual(5);
    }

    expectFieldCoverage('reviews', byHelpfulness.data, {
      text: 0.8,
      userImage: 0.8,
    });
  });

  it('returns the newest sort in non increasing date order', async () => {
    const result = await liveClient.reviews({ appId: 'com.whatsapp', paginate: true });

    expect(result.data.length).toBeGreaterThan(100);
    const timestamps = result.data.map((review) => Date.parse(review.date));
    for (const [index, timestamp] of timestamps.entries()) {
      if (index > 0) {
        expect(timestamp).toBeLessThanOrEqual(timestamps[index - 1]!);
      }
    }
  });

  it('serves a disjoint localized first page for a polish storefront', async () => {
    const defaultPage = await liveClient.reviews({ appId: 'com.whatsapp', paginate: true });
    const polishPage = await liveClient.reviews({
      appId: 'com.whatsapp',
      paginate: true,
      lang: 'pl',
      country: 'pl',
    });

    expect(polishPage.data.length).toBeGreaterThan(100);
    expect(polishPage.nextPaginationToken).not.toBeNull();
    for (const review of polishPage.data) {
      expect(review.id.length).toBeGreaterThan(0);
      expect(review.score).toBeGreaterThanOrEqual(1);
      expect(review.score).toBeLessThanOrEqual(5);
      expect(Number.isNaN(Date.parse(review.date))).toBe(false);
    }

    const defaultIds = new Set(defaultPage.data.map((review) => review.id));
    const overlap = polishPage.data.filter((review) => defaultIds.has(review.id)).length;
    expect(overlap).toBeLessThan(15);
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
    const result = await liveClient.reviews({ appId: 'com.adex77.WhereAmI', num: 5000 });

    expect(result.data.length).toBeGreaterThanOrEqual(40);
    expect(result.data.length).toBeLessThan(5000);
    expect(result.nextPaginationToken).toBeNull();
    expect(new Set(result.data.map((review) => review.id)).size).toBe(result.data.length);
  });
});
