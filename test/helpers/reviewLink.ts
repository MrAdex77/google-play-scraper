import { expect } from 'vitest';
import { BASE_URL } from '../../src/constants.ts';
import type { Review } from '../../src/index.ts';

const DETAILS_PATH = '/store/apps/details';
const LINK_KEYS = ['id', 'reviewId'];

export function expectReviewLink(
  review: Pick<Review, 'id' | 'url'>,
  appId: string,
  label = 'review',
): void {
  const link = new URL(review.url);
  const scoped = `${label} ${review.id}`;

  expect(link.origin, `${scoped}: url must address the play store`).toBe(BASE_URL);
  expect(link.pathname, `${scoped}: url must open the details page`).toBe(DETAILS_PATH);
  expect(
    [...link.searchParams.keys()],
    `${scoped}: url must carry only the app and review ids`,
  ).toEqual(LINK_KEYS);
  expect(link.searchParams.get('id'), `${scoped}: url must name the requested app`).toBe(appId);
  expect(link.searchParams.get('reviewId'), `${scoped}: url must name the review`).toBe(review.id);
}
