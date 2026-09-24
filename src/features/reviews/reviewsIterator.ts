import * as z from 'zod/mini';
import { clientFromOptions, type HttpClient, type ResolveClient } from '../../core/http.ts';
import { parseOptions } from '../../core/options.ts';
import { reviewPages, reviewsOptionsSchema } from './reviews.ts';
import { reviewSchema, type Review } from './schema.ts';

const REVIEWS_ITERATOR_CONTEXT = 'reviewsIterator';

export const reviewsIteratorOptionsSchema = z.omit(reviewsOptionsSchema, {
  num: true,
  paginate: true,
});

export type ReviewsIteratorOptions = z.input<typeof reviewsIteratorOptionsSchema>;

type ParsedReviewsIteratorOptions = z.infer<typeof reviewsIteratorOptionsSchema>;

const reviewArraySchema = z.array(reviewSchema);

async function* streamReviews(
  client: HttpClient,
  options: ParsedReviewsIteratorOptions,
): AsyncGenerator<Review, void, undefined> {
  for await (const page of reviewPages(client, options)) {
    for (const review of reviewArraySchema.parse(page.reviews)) {
      yield review;
    }
  }
}

export function createReviewsIterator(resolveClient: ResolveClient = clientFromOptions) {
  return function reviewsIterator(
    options: ReviewsIteratorOptions,
  ): AsyncGenerator<Review, void, undefined> {
    const parsed = parseOptions(reviewsIteratorOptionsSchema, options, REVIEWS_ITERATOR_CONTEXT);
    const client = resolveClient(parsed);
    return streamReviews(client, parsed);
  };
}

export const reviewsIterator = createReviewsIterator();
