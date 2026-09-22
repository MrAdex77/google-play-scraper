import { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.js';
import type { ResolveClient } from './core/http.js';
import type { MethodWrapper } from './core/options.js';
import type { app } from './features/app/app.js';
import { appOptionsSchema, createApp } from './features/app/app.js';
import type { apps } from './features/apps/apps.js';
import { createApps } from './features/apps/apps.js';
import type { availability } from './features/availability/availability.js';
import {
  availabilityOptionsSchema,
  createAvailability,
} from './features/availability/availability.js';
import {
  categories,
  categoriesOptionsSchema,
  type CategoriesOptions,
} from './features/categories/categories.js';
import type { dataSafety } from './features/datasafety/datasafety.js';
import { createDataSafety, dataSafetyOptionsSchema } from './features/datasafety/datasafety.js';
import type { developer } from './features/developer/developer.js';
import { createDeveloper, developerOptionsSchema } from './features/developer/developer.js';
import type { developerIterator } from './features/developer/developerIterator.js';
import { createDeveloperIterator } from './features/developer/developerIterator.js';
import type { list } from './features/list/list.js';
import { createList, listOptionsSchema } from './features/list/list.js';
import type { permissions } from './features/permissions/permissions.js';
import { createPermissions, permissionsOptionsSchema } from './features/permissions/permissions.js';
import type { reviews } from './features/reviews/reviews.js';
import { createReviews, reviewsOptionsSchema } from './features/reviews/reviews.js';
import type { reviewsAll } from './features/reviews/reviewsAll.js';
import { createReviewsAll } from './features/reviews/reviewsAll.js';
import type { reviewsIterator } from './features/reviews/reviewsIterator.js';
import { createReviewsIterator } from './features/reviews/reviewsIterator.js';
import type { search } from './features/search/search.js';
import { createSearch, searchOptionsSchema } from './features/search/search.js';
import type { searchIterator } from './features/search/searchIterator.js';
import { createSearchIterator } from './features/search/searchIterator.js';
import type { similar } from './features/similar/similar.js';
import { createSimilar, similarOptionsSchema } from './features/similar/similar.js';
import type { suggest } from './features/suggest/suggest.js';
import { createSuggest, suggestOptionsSchema } from './features/suggest/suggest.js';

export interface GooglePlayClient {
  BASE_URL: typeof BASE_URL;
  age: typeof age;
  category: typeof category;
  clusters: typeof clusters;
  collection: typeof collection;
  permission: typeof permission;
  sort: typeof sort;
  app: typeof app;
  apps: typeof apps;
  availability: typeof availability;
  search: typeof search;
  suggest: typeof suggest;
  list: typeof list;
  categories: typeof categories;
  developer: typeof developer;
  similar: typeof similar;
  reviews: typeof reviews;
  permissions: typeof permissions;
  dataSafety: typeof dataSafety;
}

export interface GooglePlayIterators {
  reviewsIterator: typeof reviewsIterator;
  reviewsAll: typeof reviewsAll;
  searchIterator: typeof searchIterator;
  developerIterator: typeof developerIterator;
}

export type CachedMethodName =
  | 'app'
  | 'availability'
  | 'search'
  | 'suggest'
  | 'list'
  | 'categories'
  | 'developer'
  | 'similar'
  | 'reviews'
  | 'permissions'
  | 'dataSafety';

export type Passthrough = <Options extends object, Outcome>(
  fn: (options: Options) => Outcome,
) => (options: Options) => Outcome;

export interface SurfaceComposition {
  resolveClient: ResolveClient;
  cached: MethodWrapper;
  passthrough: Passthrough;
}

export function buildClientSurface(
  composition: SurfaceComposition,
): GooglePlayClient & GooglePlayIterators {
  const { resolveClient, cached, passthrough } = composition;
  const cachedApp = cached('app', appOptionsSchema, createApp(resolveClient));
  const cachedCategories = cached('categories', categoriesOptionsSchema, categories);

  return {
    BASE_URL,
    age,
    category,
    clusters,
    collection,
    permission,
    sort,
    app: cachedApp,
    apps: passthrough(createApps(cachedApp)),
    availability: cached(
      'availability',
      availabilityOptionsSchema,
      createAvailability(resolveClient),
    ),
    search: cached('search', searchOptionsSchema, createSearch(cachedApp, resolveClient)),
    suggest: cached('suggest', suggestOptionsSchema, createSuggest(resolveClient)),
    list: cached('list', listOptionsSchema, createList(cachedApp, resolveClient)),
    categories: (options?: CategoriesOptions) => cachedCategories(options ?? {}),
    developer: cached(
      'developer',
      developerOptionsSchema,
      createDeveloper(cachedApp, resolveClient),
    ),
    similar: cached('similar', similarOptionsSchema, createSimilar(cachedApp, resolveClient)),
    reviews: cached('reviews', reviewsOptionsSchema, createReviews(resolveClient)),
    permissions: cached('permissions', permissionsOptionsSchema, createPermissions(resolveClient)),
    dataSafety: cached('dataSafety', dataSafetyOptionsSchema, createDataSafety(resolveClient)),
    reviewsIterator: passthrough(createReviewsIterator(resolveClient)),
    reviewsAll: passthrough(createReviewsAll(resolveClient)),
    searchIterator: passthrough(createSearchIterator(resolveClient)),
    developerIterator: passthrough(createDeveloperIterator(resolveClient)),
  };
}
