export { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.ts';
export type { Age, Category, Cluster, Collection, Permission, Sort } from './constants.ts';

export {
  BlockedError,
  GooglePlayError,
  HttpError,
  NotFoundError,
  ParseError,
  RateLimitError,
  SpecError,
  ValidationError,
} from './core/errors.ts';
export type { SpecFailure } from './core/errors.ts';

export type { DegradationEvent, OnDegradation } from './core/degradation.ts';
export type { IntegrityEvent, IntegrityReason, OnIntegrityEvent } from './core/integrity.ts';

export type {
  OnRequest,
  OnResponse,
  OnRetry,
  RequestEvent,
  ResponseEvent,
  RetryEvent,
} from './core/http.ts';

export { createCountryFetch, countryFetchSettingsSchema } from './core/countryFetch.ts';
export type { CountryFetchSettings } from './core/countryFetch.ts';

export { appItemSchema } from './core/appItem.ts';
export type { AppItem } from './core/appItem.ts';

export { app, appOptionsSchema } from './features/app/app.ts';
export type { AppOptions } from './features/app/app.ts';
export { appSchema } from './features/app/schema.ts';
export type { App } from './features/app/schema.ts';

export { apps, appsOptionsSchema } from './features/apps/apps.ts';
export type { AppsEntry, AppsOptions } from './features/apps/apps.ts';

export { availability, availabilityOptionsSchema } from './features/availability/availability.ts';
export type { AvailabilityOptions } from './features/availability/availability.ts';
export {
  availabilityResultSchema,
  countryAvailabilitySchema,
} from './features/availability/schema.ts';
export type { AvailabilityResult, CountryAvailability } from './features/availability/schema.ts';

export { search, searchOptionsSchema } from './features/search/search.ts';
export type { SearchOptions } from './features/search/search.ts';
export type { SearchResult } from './features/search/schema.ts';

export { suggest, suggestOptionsSchema } from './features/suggest/suggest.ts';
export type { SuggestOptions } from './features/suggest/suggest.ts';

export { list, listOptionsSchema } from './features/list/list.ts';
export type { ListOptions } from './features/list/list.ts';
export type { ListItem } from './features/list/schema.ts';

export { categories, categoriesOptionsSchema } from './features/categories/categories.ts';
export type { CategoriesOptions } from './features/categories/categories.ts';

export { developer, developerOptionsSchema } from './features/developer/developer.ts';
export type { DeveloperOptions } from './features/developer/developer.ts';
export type { DeveloperApp } from './features/developer/schema.ts';

export { similar, similarOptionsSchema } from './features/similar/similar.ts';
export type { SimilarOptions } from './features/similar/similar.ts';
export type { SimilarApp } from './features/similar/schema.ts';

export { reviews, reviewsOptionsSchema } from './features/reviews/reviews.ts';
export type { ReviewsOptions } from './features/reviews/reviews.ts';
export { reviewSchema, reviewsResultSchema } from './features/reviews/schema.ts';
export type { Review, ReviewsResult } from './features/reviews/schema.ts';

export {
  reviewsIterator,
  reviewsIteratorOptionsSchema,
} from './features/reviews/reviewsIterator.ts';
export type { ReviewsIteratorOptions } from './features/reviews/reviewsIterator.ts';

export { reviewsAll, reviewsAllOptionsSchema } from './features/reviews/reviewsAll.ts';
export type { ReviewsAllOptions } from './features/reviews/reviewsAll.ts';

export { searchIterator, searchIteratorOptionsSchema } from './features/search/searchIterator.ts';
export type { SearchIteratorOptions } from './features/search/searchIterator.ts';

export {
  developerIterator,
  developerIteratorOptionsSchema,
} from './features/developer/developerIterator.ts';
export type { DeveloperIteratorOptions } from './features/developer/developerIterator.ts';

export { permissions, permissionsOptionsSchema } from './features/permissions/permissions.ts';
export type { PermissionsOptions } from './features/permissions/permissions.ts';
export { permissionSchema } from './features/permissions/schema.ts';
export type { AppPermission } from './features/permissions/schema.ts';

export { dataSafety, dataSafetyOptionsSchema } from './features/datasafety/datasafety.ts';
export type { DataSafetyOptions } from './features/datasafety/datasafety.ts';
export {
  dataEntrySchema,
  dataSafetySchema,
  securityPracticeSchema,
} from './features/datasafety/schema.ts';
export type { DataEntry, DataSafety, SecurityPractice } from './features/datasafety/schema.ts';

export { memoized, memoizedOptionsSchema } from './features/memoized/memoized.ts';
export type { ClientCache, MemoizedClient, MemoizedOptions } from './features/memoized/memoized.ts';

export { createClient, clientOptionsSchema } from './client.ts';
export type { ClientOptions } from './client.ts';
export type { CachedMethodName, GooglePlayClient, GooglePlayIterators } from './clientSurface.ts';

import { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.ts';
import { app } from './features/app/app.ts';
import { apps } from './features/apps/apps.ts';
import { availability } from './features/availability/availability.ts';
import { search } from './features/search/search.ts';
import { suggest } from './features/suggest/suggest.ts';
import { list } from './features/list/list.ts';
import { categories } from './features/categories/categories.ts';
import { developer } from './features/developer/developer.ts';
import { similar } from './features/similar/similar.ts';
import { reviews } from './features/reviews/reviews.ts';
import { reviewsIterator } from './features/reviews/reviewsIterator.ts';
import { reviewsAll } from './features/reviews/reviewsAll.ts';
import { searchIterator } from './features/search/searchIterator.ts';
import { developerIterator } from './features/developer/developerIterator.ts';
import { permissions } from './features/permissions/permissions.ts';
import { dataSafety } from './features/datasafety/datasafety.ts';
import { memoized } from './features/memoized/memoized.ts';
import { createClient } from './client.ts';
import type { GooglePlayClient, GooglePlayIterators } from './clientSurface.ts';

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
