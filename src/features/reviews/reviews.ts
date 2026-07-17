import * as z from 'zod/mini';
import { sort } from '../../constants.js';
import { parseBatchResponse } from '../../core/batchexecute.js';
import { clientFromOptions, type HttpClient, type ResolveClient } from '../../core/http.js';
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

const sortSchema = z._default(
  z.union([z.literal(sort.NEWEST), z.literal(sort.RATING), z.literal(sort.HELPFULNESS)]),
  sort.NEWEST,
);

export const reviewsOptionsSchema = z.extend(baseOptionsSchema, {
  appId: z.string().check(z.minLength(1)),
  sort: sortSchema,
  num: z._default(z.int().check(z.gte(1)), 150),
  paginate: z._default(z.boolean(), false),
  nextPaginationToken: z.optional(z.string()),
});

export type ReviewsOptions = z.input<typeof reviewsOptionsSchema>;

type ParsedReviewsOptions = z.infer<typeof reviewsOptionsSchema>;
type ReviewItem = Extracted<typeof reviewItemSpecs>;

export type ReviewPageQuery = Pick<
  ParsedReviewsOptions,
  'appId' | 'sort' | 'lang' | 'country' | 'nextPaginationToken'
>;

export interface ReviewsPage {
  reviews: ReviewItem[];
  token: string | undefined;
}

function reviewsBody(options: ReviewPageQuery, token: string | undefined): string {
  return token === undefined
    ? buildInitialReviewsBody(options.sort, options.appId)
    : buildPaginatedReviewsBody(options.sort, options.appId, token);
}

async function fetchReviewsPage(
  client: HttpClient,
  options: ReviewPageQuery,
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

export async function* reviewPages(
  client: HttpClient,
  options: ReviewPageQuery,
): AsyncGenerator<ReviewsPage, void, undefined> {
  const seenTokens = new Set<string>();
  let token = options.nextPaginationToken;

  for (;;) {
    const page = await fetchReviewsPage(client, options, token);
    yield page;

    if (page.token === undefined || seenTokens.has(page.token)) {
      return;
    }
    seenTokens.add(page.token);
    token = page.token;
  }
}

async function accumulateReviews(
  client: HttpClient,
  options: ParsedReviewsOptions,
): Promise<ReviewsResult> {
  const collected: ReviewItem[] = [];

  for await (const page of reviewPages(client, options)) {
    for (const review of page.reviews) {
      collected.push(review);
    }
    if (collected.length >= options.num) {
      break;
    }
  }

  return reviewsResultSchema.parse({
    data: collected.slice(0, options.num),
    nextPaginationToken: null,
  });
}

export function createReviews(resolveClient: ResolveClient = clientFromOptions) {
  return async function reviews(options: ReviewsOptions): Promise<ReviewsResult> {
    const parsed = parseOptions(reviewsOptionsSchema, options, REVIEWS_CONTEXT);
    const client = resolveClient(parsed);

    return parsed.paginate ? fetchSinglePage(client, parsed) : accumulateReviews(client, parsed);
  };
}

export const reviews = createReviews();
