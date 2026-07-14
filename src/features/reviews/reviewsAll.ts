import { z } from 'zod';
import { clientFromOptions, type ResolveClient } from '../../core/http.js';
import { parseOptions } from '../../core/options.js';
import { createReviewsIterator, reviewsIteratorOptionsSchema } from './reviewsIterator.js';
import type { Review } from './schema.js';

const REVIEWS_ALL_CONTEXT = 'reviewsAll';

export const reviewsAllOptionsSchema = reviewsIteratorOptionsSchema.extend({
  maxReviews: z.number().int().min(1).optional(),
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
