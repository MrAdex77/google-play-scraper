import { z } from 'zod';
import { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.js';
import {
  clientFromOptions,
  createHttpClient,
  createRateLimiter,
  type Limiter,
  type ResolveClient,
} from './core/http.js';
import { parseOptions, requestOptionsSchema, type RequestOptions } from './core/options.js';
import { createApp, type AppOptions } from './features/app/app.js';
import { categories, type CategoriesOptions } from './features/categories/categories.js';
import { createDatasafety, type DataSafetyOptions } from './features/datasafety/datasafety.js';
import { createDeveloper, type DeveloperOptions } from './features/developer/developer.js';
import { createList, type ListOptions } from './features/list/list.js';
import { createPermissions, type PermissionsOptions } from './features/permissions/permissions.js';
import { createReviews, type ReviewsOptions } from './features/reviews/reviews.js';
import {
  createReviewsIterator,
  type ReviewsIteratorOptions,
} from './features/reviews/reviewsIterator.js';
import { createReviewsAll, type ReviewsAllOptions } from './features/reviews/reviewsAll.js';
import { createSearch, type SearchOptions } from './features/search/search.js';
import {
  createSearchIterator,
  type SearchIteratorOptions,
} from './features/search/searchIterator.js';
import { createSimilar, type SimilarOptions } from './features/similar/similar.js';
import {
  createDeveloperIterator,
  type DeveloperIteratorOptions,
} from './features/developer/developerIterator.js';
import { createSuggest, type SuggestOptions } from './features/suggest/suggest.js';
import type { GooglePlayClient, GooglePlayIterators } from './index.js';

export const clientOptionsSchema = z.object({
  lang: z.string().min(2).max(7).optional(),
  country: z.string().length(2).optional(),
  throttle: z.number().positive().max(50).optional(),
  requestOptions: requestOptionsSchema.optional(),
});

export type ClientOptions = z.input<typeof clientOptionsSchema>;

const CLIENT_CONTEXT = 'client';

function mergeRequestOptions(
  base: RequestOptions | undefined,
  override: RequestOptions | undefined,
): RequestOptions | undefined {
  if (base === undefined || override === undefined) {
    return override ?? base;
  }
  return { ...base, ...override };
}

export function createClient(options?: ClientOptions): GooglePlayClient & GooglePlayIterators {
  const parsed = parseOptions(clientOptionsSchema, options ?? {}, CLIENT_CONTEXT);
  const limiter: Limiter | undefined =
    parsed.throttle !== undefined ? createRateLimiter(parsed.throttle) : undefined;

  const resolveClient: ResolveClient = (opts) => {
    const requestOptions = mergeRequestOptions(parsed.requestOptions, opts.requestOptions);
    if (limiter !== undefined) {
      return createHttpClient({
        limiter,
        fetchImpl: requestOptions?.fetchImpl,
        retries: requestOptions?.retries,
        timeoutMs: requestOptions?.timeoutMs,
        headers: requestOptions?.headers,
        signal: requestOptions?.signal,
      });
    }
    return clientFromOptions({ throttle: opts.throttle, requestOptions });
  };

  const mergeDefaults = <Options extends { lang?: string; country?: string }>(
    callOptions: Options,
  ): Options => {
    const merged = { ...callOptions };
    if (merged.lang === undefined && parsed.lang !== undefined) {
      merged.lang = parsed.lang;
    }
    if (merged.country === undefined && parsed.country !== undefined) {
      merged.country = parsed.country;
    }
    return merged;
  };

  const boundApp = createApp(resolveClient);
  const boundSearch = createSearch(boundApp, resolveClient);
  const boundList = createList(boundApp, resolveClient);
  const boundDeveloper = createDeveloper(boundApp, resolveClient);
  const boundSimilar = createSimilar(boundApp, resolveClient);
  const boundSuggest = createSuggest(resolveClient);
  const boundReviews = createReviews(resolveClient);
  const boundReviewsIterator = createReviewsIterator(resolveClient);
  const boundReviewsAll = createReviewsAll(resolveClient);
  const boundSearchIterator = createSearchIterator(resolveClient);
  const boundDeveloperIterator = createDeveloperIterator(resolveClient);
  const boundPermissions = createPermissions(resolveClient);
  const boundDatasafety = createDatasafety(resolveClient);

  return {
    BASE_URL,
    age,
    category,
    clusters,
    collection,
    permission,
    sort,
    app: (callOptions: AppOptions) => boundApp(mergeDefaults(callOptions)),
    search: (callOptions: SearchOptions) => boundSearch(mergeDefaults(callOptions)),
    suggest: (callOptions: SuggestOptions) => boundSuggest(mergeDefaults(callOptions)),
    list: (callOptions: ListOptions) => boundList(mergeDefaults(callOptions)),
    categories: (callOptions?: CategoriesOptions) => categories(callOptions),
    developer: (callOptions: DeveloperOptions) => boundDeveloper(mergeDefaults(callOptions)),
    similar: (callOptions: SimilarOptions) => boundSimilar(mergeDefaults(callOptions)),
    reviews: (callOptions: ReviewsOptions) => boundReviews(mergeDefaults(callOptions)),
    reviewsIterator: (callOptions: ReviewsIteratorOptions) =>
      boundReviewsIterator(mergeDefaults(callOptions)),
    reviewsAll: (callOptions: ReviewsAllOptions) => boundReviewsAll(mergeDefaults(callOptions)),
    searchIterator: (callOptions: SearchIteratorOptions) =>
      boundSearchIterator(mergeDefaults(callOptions)),
    developerIterator: (callOptions: DeveloperIteratorOptions) =>
      boundDeveloperIterator(mergeDefaults(callOptions)),
    permissions: (callOptions: PermissionsOptions) => boundPermissions(mergeDefaults(callOptions)),
    datasafety: (callOptions: DataSafetyOptions) => boundDatasafety(mergeDefaults(callOptions)),
  };
}
