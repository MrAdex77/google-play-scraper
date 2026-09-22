import { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.ts';
import type { ResolveClient } from './core/http.ts';
import type { MethodWrapper } from './core/options.ts';
import type { app } from './features/app/app.ts';
import { appOptionsSchema, createApp } from './features/app/app.ts';
import type { apps } from './features/apps/apps.ts';
import { createApps } from './features/apps/apps.ts';
import type { availability } from './features/availability/availability.ts';
import {
  availabilityOptionsSchema,
  createAvailability,
} from './features/availability/availability.ts';
import {
  categories,
  categoriesOptionsSchema,
  type CategoriesOptions,
} from './features/categories/categories.ts';
import type { dataSafety } from './features/datasafety/datasafety.ts';
import { createDataSafety, dataSafetyOptionsSchema } from './features/datasafety/datasafety.ts';
import type { developer } from './features/developer/developer.ts';
import { createDeveloper, developerOptionsSchema } from './features/developer/developer.ts';
import type { developerIterator } from './features/developer/developerIterator.ts';
import { createDeveloperIterator } from './features/developer/developerIterator.ts';
import type { list } from './features/list/list.ts';
import { createList, listOptionsSchema } from './features/list/list.ts';
import type { permissions } from './features/permissions/permissions.ts';
import { createPermissions, permissionsOptionsSchema } from './features/permissions/permissions.ts';
import type { reviews } from './features/reviews/reviews.ts';
import { createReviews, reviewsOptionsSchema } from './features/reviews/reviews.ts';
import type { reviewsAll } from './features/reviews/reviewsAll.ts';
import { createReviewsAll } from './features/reviews/reviewsAll.ts';
import type { reviewsIterator } from './features/reviews/reviewsIterator.ts';
import { createReviewsIterator } from './features/reviews/reviewsIterator.ts';
import type { search } from './features/search/search.ts';
import { createSearch, searchOptionsSchema } from './features/search/search.ts';
import type { searchIterator } from './features/search/searchIterator.ts';
import { createSearchIterator } from './features/search/searchIterator.ts';
import type { similar } from './features/similar/similar.ts';
import { createSimilar, similarOptionsSchema } from './features/similar/similar.ts';
import type { suggest } from './features/suggest/suggest.ts';
import { createSuggest, suggestOptionsSchema } from './features/suggest/suggest.ts';

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
  cached: MethodWrapper<CachedMethodName>;
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
