import * as z from 'zod/mini';
import { clientFromOptions, type ResolveClient } from '../../core/http.ts';
import { parseOptions } from '../../core/options.ts';
import { createReviewsIterator, reviewsIteratorOptionsSchema } from './reviewsIterator.ts';
import type { Review } from './schema.ts';

const REVIEWS_ALL_CONTEXT = 'reviewsAll';

export const reviewsAllOptionsSchema = z.extend(reviewsIteratorOptionsSchema, {
  maxReviews: z.optional(z.int().check(z.gte(1))),
});

export type ReviewsAllOptions = z.input<typeof reviewsAllOptionsSchema>;

export function createReviewsAll(resolveClient: ResolveClient = clientFromOptions) {
  const reviewsIterator = createReviewsIterator(resolveClient);

  return async function reviewsAll(options: ReviewsAllOptions): Promise<Review[]> {
    const { maxReviews, ...iteratorOptions } = parseOptions(
      reviewsAllOptionsSchema,
      options,
      REVIEWS_ALL_CONTEXT,
    );

    const collected: Review[] = [];
    for await (const review of reviewsIterator(iteratorOptions)) {
      collected.push(review);
      if (maxReviews !== undefined && collected.length >= maxReviews) {
        break;
      }
    }

    return collected;
  };
}

export const reviewsAll = createReviewsAll();
