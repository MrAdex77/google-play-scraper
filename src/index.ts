export { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.js';
export type { Age, Category, Cluster, Collection, Permission, Sort } from './constants.js';

export {
  BlockedError,
  GooglePlayError,
  HttpError,
  NotFoundError,
  ParseError,
  RateLimitError,
  SpecError,
  ValidationError,
} from './core/errors.js';
export type { SpecFailure } from './core/errors.js';

export type { DegradationEvent, OnDegradation } from './core/degradation.js';

export type {
  OnRequest,
  OnResponse,
  OnRetry,
  RequestEvent,
  ResponseEvent,
  RetryEvent,
} from './core/http.js';

export { createCountryFetch, countryFetchSettingsSchema } from './core/countryFetch.js';
export type { CountryFetchSettings } from './core/countryFetch.js';

export { appItemSchema } from './core/appItem.js';
export type { AppItem } from './core/appItem.js';

export { app, appOptionsSchema } from './features/app/app.js';
export type { AppOptions } from './features/app/app.js';
export { appSchema } from './features/app/schema.js';
export type { App } from './features/app/schema.js';

export { apps, appsOptionsSchema } from './features/apps/apps.js';
export type { AppsEntry, AppsOptions } from './features/apps/apps.js';

export { availability, availabilityOptionsSchema } from './features/availability/availability.js';
export type { AvailabilityOptions } from './features/availability/availability.js';
export {
  availabilityResultSchema,
  countryAvailabilitySchema,
} from './features/availability/schema.js';
export type { AvailabilityResult, CountryAvailability } from './features/availability/schema.js';

export { search, searchOptionsSchema } from './features/search/search.js';
export type { SearchOptions } from './features/search/search.js';
export type { SearchResult } from './features/search/schema.js';

export { suggest, suggestOptionsSchema } from './features/suggest/suggest.js';
export type { SuggestOptions } from './features/suggest/suggest.js';

export { list, listOptionsSchema } from './features/list/list.js';
export type { ListOptions } from './features/list/list.js';
export type { ListItem } from './features/list/schema.js';

export { categories, categoriesOptionsSchema } from './features/categories/categories.js';
export type { CategoriesOptions } from './features/categories/categories.js';

export { developer, developerOptionsSchema } from './features/developer/developer.js';
export type { DeveloperOptions } from './features/developer/developer.js';
export type { DeveloperApp } from './features/developer/schema.js';

export { similar, similarOptionsSchema } from './features/similar/similar.js';
export type { SimilarOptions } from './features/similar/similar.js';
export type { SimilarApp } from './features/similar/schema.js';

export { reviews, reviewsOptionsSchema } from './features/reviews/reviews.js';
export type { ReviewsOptions } from './features/reviews/reviews.js';
export { reviewSchema, reviewsResultSchema } from './features/reviews/schema.js';
export type { Review, ReviewsResult } from './features/reviews/schema.js';

export {
  reviewsIterator,
  reviewsIteratorOptionsSchema,
} from './features/reviews/reviewsIterator.js';
export type { ReviewsIteratorOptions } from './features/reviews/reviewsIterator.js';

export { reviewsAll, reviewsAllOptionsSchema } from './features/reviews/reviewsAll.js';
export type { ReviewsAllOptions } from './features/reviews/reviewsAll.js';

export { searchIterator, searchIteratorOptionsSchema } from './features/search/searchIterator.js';
export type { SearchIteratorOptions } from './features/search/searchIterator.js';

export {
  developerIterator,
  developerIteratorOptionsSchema,
} from './features/developer/developerIterator.js';
export type { DeveloperIteratorOptions } from './features/developer/developerIterator.js';

export { permissions, permissionsOptionsSchema } from './features/permissions/permissions.js';
export type { PermissionsOptions } from './features/permissions/permissions.js';
export { permissionSchema } from './features/permissions/schema.js';
export type { AppPermission } from './features/permissions/schema.js';

export { dataSafety, dataSafetyOptionsSchema } from './features/datasafety/datasafety.js';
export type { DataSafetyOptions } from './features/datasafety/datasafety.js';
export {
  dataEntrySchema,
  dataSafetySchema,
  securityPracticeSchema,
} from './features/datasafety/schema.js';
export type { DataEntry, DataSafety, SecurityPractice } from './features/datasafety/schema.js';

export { memoized } from './features/memoized/memoized.js';
export type { MemoizedOptions } from './features/memoized/memoized.js';

export { createClient, clientOptionsSchema } from './client.js';
export type { ClientOptions } from './client.js';

import { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.js';
import { app } from './features/app/app.js';
import { apps } from './features/apps/apps.js';
import { availability } from './features/availability/availability.js';
import { search } from './features/search/search.js';
import { suggest } from './features/suggest/suggest.js';
import { list } from './features/list/list.js';
import { categories } from './features/categories/categories.js';
import { developer } from './features/developer/developer.js';
import { similar } from './features/similar/similar.js';
import { reviews } from './features/reviews/reviews.js';
import { reviewsIterator } from './features/reviews/reviewsIterator.js';
import { reviewsAll } from './features/reviews/reviewsAll.js';
import { searchIterator } from './features/search/searchIterator.js';
import { developerIterator } from './features/developer/developerIterator.js';
import { permissions } from './features/permissions/permissions.js';
import { dataSafety } from './features/datasafety/datasafety.js';
import { memoized } from './features/memoized/memoized.js';
import { createClient } from './client.js';

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

const gplay: GooglePlayClient &
  GooglePlayIterators & {
    memoized: typeof memoized;
    createClient: typeof createClient;
  } = {
  BASE_URL,
  age,
  category,
  clusters,
  collection,
  permission,
  sort,
  app,
  apps,
  availability,
  search,
  suggest,
  list,
  categories,
  developer,
  similar,
  reviews,
  reviewsIterator,
  reviewsAll,
  searchIterator,
  developerIterator,
  permissions,
  dataSafety,
  memoized,
  createClient,
};

export default gplay;
