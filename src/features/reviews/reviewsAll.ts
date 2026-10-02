import * as z from 'zod/mini';
import { clientFromOptions, type ResolveClient } from '../../core/http.ts';
import { parseOptions } from '../../core/options.ts';
import { reviewsIteratorOptionsSchema, streamReviews } from './reviewsIterator.ts';
import type { Review } from './schema.ts';

const REVIEWS_ALL_CONTEXT = 'reviewsAll';

export const reviewsAllOptionsSchema = z.extend(reviewsIteratorOptionsSchema, {
  maxReviews: z.optional(z.int().check(z.gte(1))),
});

export type ReviewsAllOptions = z.input<typeof reviewsAllOptionsSchema>;

export function createReviewsAll(resolveClient: ResolveClient = clientFromOptions) {
  return async function reviewsAll(options: ReviewsAllOptions): Promise<Review[]> {
    const { maxReviews, ...iteratorOptions } = parseOptions(
      reviewsAllOptionsSchema,
      options,
      REVIEWS_ALL_CONTEXT,
    );
    const client = resolveClient(iteratorOptions);

    const collected: Review[] = [];
    for await (const review of streamReviews(client, iteratorOptions, maxReviews)) {
      collected.push(review);
      if (maxReviews !== undefined && collected.length >= maxReviews) {
        break;
      }
    }

    return collected;
  };
}

export const reviewsAll = createReviewsAll();
