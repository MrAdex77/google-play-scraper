import { expect, it } from 'vitest';
import { reviews, sort } from '../src/index.js';
import { liveDescribe, throttled } from './helpers.js';

const TRANSLATE = 'com.google.android.apps.translate';

liveDescribe('reviews live contract', () => {
  it('returns a valid first page for the Where Am I geography game', async () => {
    const result = await reviews(throttled({ appId: 'com.adex77.WhereAmI', paginate: true }));

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
    const result = await reviews(throttled({ appId: TRANSLATE, num: 200 }));

    expect(result.data).toHaveLength(200);
    expect(result.nextPaginationToken).toBeNull();
    expect(new Set(result.data.map((review) => review.id)).size).toBe(200);
  });

  it('walks two manual pages that surface different first reviews', async () => {
    const firstPage = await reviews(throttled({ appId: TRANSLATE, paginate: true }));
    expect(firstPage.nextPaginationToken).not.toBeNull();

    const token = firstPage.nextPaginationToken;
    if (token === null) {
      throw new Error('expected a pagination token on the first page');
    }

    const secondPage = await reviews(
      throttled({
        appId: TRANSLATE,
        paginate: true,
        nextPaginationToken: token,
      }),
    );

    expect(firstPage.data[0]?.id).not.toBe(secondPage.data[0]?.id);
  });

  it('returns valid pages for the rating and helpfulness sort orders', async () => {
    const byRating = await reviews(
      throttled({ appId: TRANSLATE, sort: sort.RATING, paginate: true }),
    );
    const byHelpfulness = await reviews(
      throttled({
        appId: TRANSLATE,
        sort: sort.HELPFULNESS,
        paginate: true,
      }),
    );

    expect(byRating.data.length).toBeGreaterThan(0);
    expect(byHelpfulness.data.length).toBeGreaterThan(0);
    for (const review of [...byRating.data, ...byHelpfulness.data]) {
      expect(review.score).toBeGreaterThanOrEqual(1);
      expect(review.score).toBeLessThanOrEqual(5);
    }
  });
});
