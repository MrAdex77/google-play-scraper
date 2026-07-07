import { z } from 'zod';
import { sort } from '../../constants.js';
import { parseBatchResponse } from '../../core/batchexecute.js';
import { clientFromOptions, type HttpClient } from '../../core/http.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { getPath } from '../../core/path.js';
import { extract, type Extracted } from '../../core/spec.js';
import { reviewsResultSchema, type ReviewsResult } from './schema.js';
import {
  buildInitialReviewsBody,
  buildPaginatedReviewsBody,
  REVIEWS_RESPONSE_PATHS,
  REVIEWS_RPC_ID,
  reviewItemSpecs,
  reviewsUrl,
} from './specs.js';

const REVIEWS_CONTEXT = 'reviews';

const sortSchema = z
  .union([z.literal(sort.NEWEST), z.literal(sort.RATING), z.literal(sort.HELPFULNESS)])
  .default(sort.NEWEST);

export const reviewsOptionsSchema = baseOptionsSchema.extend({
  appId: z.string().min(1),
  sort: sortSchema,
  num: z.number().int().min(1).default(150),
  paginate: z.boolean().default(false),
  nextPaginationToken: z.string().optional(),
});

export type ReviewsOptions = z.input<typeof reviewsOptionsSchema>;

type ParsedReviewsOptions = z.infer<typeof reviewsOptionsSchema>;
type ReviewItem = Extracted<typeof reviewItemSpecs>;

interface ReviewsPage {
  reviews: ReviewItem[];
  token: string | undefined;
}

function reviewsBody(options: ParsedReviewsOptions, token: string | undefined): string {
  return token === undefined
    ? buildInitialReviewsBody(options.sort, options.appId)
    : buildPaginatedReviewsBody(options.sort, options.appId, token);
}

async function fetchReviewsPage(
  client: HttpClient,
  options: ParsedReviewsOptions,
  token: string | undefined,
): Promise<ReviewsPage> {
  const text = await client.request({
    url: reviewsUrl(options.lang, options.country),
    method: 'POST',
    body: reviewsBody(options, token),
  });

  const payload = parseBatchResponse(text, REVIEWS_RPC_ID);
  const rawReviews = getPath(payload, REVIEWS_RESPONSE_PATHS.reviews);
  const reviews = Array.isArray(rawReviews)
    ? rawReviews.map((item) => extract(item, reviewItemSpecs, REVIEWS_CONTEXT))
    : [];

  const rawToken = getPath(payload, REVIEWS_RESPONSE_PATHS.token);
  const nextToken = typeof rawToken === 'string' && rawToken.length > 0 ? rawToken : undefined;

  return { reviews, token: nextToken };
}

async function fetchSinglePage(
  client: HttpClient,
  options: ParsedReviewsOptions,
): Promise<ReviewsResult> {
  const page = await fetchReviewsPage(client, options, options.nextPaginationToken);
  return reviewsResultSchema.parse({
    data: page.reviews,
    nextPaginationToken: page.token ?? null,
  });
}

async function accumulateReviews(
  client: HttpClient,
  options: ParsedReviewsOptions,
): Promise<ReviewsResult> {
  const collected: ReviewItem[] = [];
  const seenTokens = new Set<string>();
  let token = options.nextPaginationToken;

  while (collected.length < options.num) {
    const page = await fetchReviewsPage(client, options, token);
    for (const review of page.reviews) {
      collected.push(review);
    }

    if (page.token === undefined || seenTokens.has(page.token)) {
      break;
    }
    seenTokens.add(page.token);
    token = page.token;
  }

  return reviewsResultSchema.parse({
    data: collected.slice(0, options.num),
    nextPaginationToken: null,
  });
}

export async function reviews(options: ReviewsOptions): Promise<ReviewsResult> {
  const parsed = parseOptions(reviewsOptionsSchema, options, REVIEWS_CONTEXT);
  const client = clientFromOptions(parsed);

  return parsed.paginate ? fetchSinglePage(client, parsed) : accumulateReviews(client, parsed);
}
