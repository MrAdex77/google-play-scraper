import * as z from 'zod/mini';
import { device, sort } from '../../constants.ts';
import { parseBatchResponse } from '../../core/batchexecute.ts';
import { ParseError } from '../../core/errors.ts';
import { clientFromOptions, type HttpClient, type ResolveClient } from '../../core/http.ts';
import { detectPaginationTokenCycle } from '../../core/integrity.ts';
import { appIdSchema, baseOptionsSchema, parseOptions } from '../../core/options.ts';
import { getPath } from '../../core/path.ts';
import { parseRaw } from '../../core/raw.ts';
import { extract, type Extracted } from '../../core/spec.ts';
import { reviewsResultSchema, type ReviewsResult } from './schema.ts';
import {
  buildReviewsBody,
  DEFAULT_REVIEWS_PAGE_SIZE,
  MAX_REVIEWS_PAGE_SIZE,
  REVIEWS_RESPONSE_PATHS,
  REVIEWS_RPC_ID,
  reviewItemSpecs,
  reviewsCollectionResponseSchema,
  reviewsTokenResponseSchema,
  reviewsUrl,
} from './specs.ts';

const REVIEWS_CONTEXT = 'reviews';
const REQUEST_BUDGET_FACTOR = 2;

const sortSchema = z._default(
  z.union([z.literal(sort.NEWEST), z.literal(sort.RATING), z.literal(sort.HELPFULNESS)]),
  sort.NEWEST,
);

export const reviewScoreSchema = z.literal([1, 2, 3, 4, 5]);

export const reviewsOptionsSchema = z.extend(baseOptionsSchema, {
  appId: appIdSchema,
  sort: sortSchema,
  num: z._default(z.int().check(z.gte(1)), DEFAULT_REVIEWS_PAGE_SIZE),
  paginate: z._default(z.boolean(), false),
  nextPaginationToken: z.optional(z.string()),
  score: z.optional(reviewScoreSchema),
  device: z.optional(z.enum(device)),
  pageSize: z.optional(z.int().check(z.gte(1), z.lte(MAX_REVIEWS_PAGE_SIZE))),
});

export type ReviewsOptions = z.input<typeof reviewsOptionsSchema>;

type ParsedReviewsOptions = z.infer<typeof reviewsOptionsSchema>;
type ReviewItem = Extracted<typeof reviewItemSpecs>;

export type ReviewPageQuery = Pick<
  ParsedReviewsOptions,
  | 'appId'
  | 'sort'
  | 'lang'
  | 'country'
  | 'nextPaginationToken'
  | 'score'
  | 'device'
  | 'pageSize'
  | 'onIntegrityEvent'
>;

export interface ReviewsPage {
  reviews: ReviewItem[];
  token: string | undefined;
}

async function fetchReviewsPage(
  client: HttpClient,
  options: ReviewPageQuery,
  token: string | undefined,
  count: number,
): Promise<ReviewsPage> {
  const text = await client.request({
    url: reviewsUrl(options.lang, options.country),
    method: 'POST',
    body: buildReviewsBody({
      appId: options.appId,
      sort: options.sort,
      count,
      token,
      score: options.score,
      device: options.device,
    }),
  });

  const payload = parseBatchResponse(text, REVIEWS_RPC_ID);
  parseRaw(reviewsCollectionResponseSchema, payload, `${REVIEWS_CONTEXT} collection response`);
  parseRaw(reviewsTokenResponseSchema, payload, `${REVIEWS_CONTEXT} token response`);
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
  const page = await fetchReviewsPage(
    client,
    options,
    options.nextPaginationToken,
    options.pageSize ?? DEFAULT_REVIEWS_PAGE_SIZE,
  );
  return reviewsResultSchema.parse({
    data: page.reviews,
    nextPaginationToken: page.token ?? null,
  });
}

function defaultPageSize(limit: number | undefined): number {
  return limit === undefined ? DEFAULT_REVIEWS_PAGE_SIZE : MAX_REVIEWS_PAGE_SIZE;
}

interface BudgetExhaustion {
  budget: number;
  collected: number;
  target: number;
}

function reportExhaustedBudget(options: ReviewPageQuery, exhaustion: BudgetExhaustion): void {
  const { budget, collected, target } = exhaustion;
  const error = new ParseError(
    `${REVIEWS_CONTEXT}: request budget of ${budget.toString()} exhausted after collecting ${collected.toString()} of ${target.toString()} requested reviews`,
  );
  options.onIntegrityEvent?.({
    context: REVIEWS_CONTEXT,
    reason: 'request-budget-exhausted',
    error,
  });
}

export async function* reviewPages(
  client: HttpClient,
  options: ReviewPageQuery,
  limit?: number,
): AsyncGenerator<ReviewsPage, void, undefined> {
  const pageSize = options.pageSize ?? defaultPageSize(limit);
  const target = limit ?? Number.POSITIVE_INFINITY;
  const budget = REQUEST_BUDGET_FACTOR * Math.ceil(target / pageSize);
  const seenTokens = new Set<string>();
  let token = options.nextPaginationToken;
  let collected = 0;
  let requests = 0;

  for (;;) {
    const page = await fetchReviewsPage(
      client,
      options,
      token,
      Math.min(pageSize, target - collected),
    );
    requests += 1;
    collected += page.reviews.length;
    yield page;

    if (page.token === undefined || collected >= target) {
      return;
    }
    if (
      detectPaginationTokenCycle(seenTokens, page.token, REVIEWS_CONTEXT, options.onIntegrityEvent)
    ) {
      return;
    }
    if (requests >= budget) {
      reportExhaustedBudget(options, { budget, collected, target });
      return;
    }
    token = page.token;
  }
}

async function accumulateReviews(
  client: HttpClient,
  options: ParsedReviewsOptions,
): Promise<ReviewsResult> {
  const collected: ReviewItem[] = [];

  for await (const page of reviewPages(client, options, options.num)) {
    for (const review of page.reviews) {
      collected.push(review);
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
