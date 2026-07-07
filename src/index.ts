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

export { app } from './features/app/app.js';
export type { AppOptions } from './features/app/app.js';
export type { App } from './features/app/schema.js';

export { search } from './features/search/search.js';
export type { SearchOptions } from './features/search/search.js';
export type { SearchResult } from './features/search/schema.js';

export { suggest } from './features/suggest/suggest.js';
export type { SuggestOptions } from './features/suggest/suggest.js';

export { list } from './features/list/list.js';
export type { ListOptions } from './features/list/list.js';
export type { ListItem } from './features/list/schema.js';

export { categories } from './features/categories/categories.js';
export type { CategoriesOptions } from './features/categories/categories.js';

export { developer } from './features/developer/developer.js';
export type { DeveloperOptions } from './features/developer/developer.js';
export type { DeveloperApp } from './features/developer/schema.js';

export { similar } from './features/similar/similar.js';
export type { SimilarOptions } from './features/similar/similar.js';
export type { SimilarApp } from './features/similar/schema.js';

export { reviews } from './features/reviews/reviews.js';
export type { ReviewsOptions } from './features/reviews/reviews.js';
export type { Review, ReviewsResult } from './features/reviews/schema.js';

export { permissions } from './features/permissions/permissions.js';
export type { PermissionsOptions } from './features/permissions/permissions.js';
export type { AppPermission } from './features/permissions/schema.js';

export { datasafety } from './features/datasafety/datasafety.js';
export type { DataSafetyOptions } from './features/datasafety/datasafety.js';
export type { DataEntry, DataSafety, SecurityPractice } from './features/datasafety/schema.js';

export { memoized } from './features/memoized/memoized.js';
export type { MemoizedOptions } from './features/memoized/memoized.js';

import { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.js';
import { app } from './features/app/app.js';
import { search } from './features/search/search.js';
import { suggest } from './features/suggest/suggest.js';
import { list } from './features/list/list.js';
import { categories } from './features/categories/categories.js';
import { developer } from './features/developer/developer.js';
import { similar } from './features/similar/similar.js';
import { reviews } from './features/reviews/reviews.js';
import { permissions } from './features/permissions/permissions.js';
import { datasafety } from './features/datasafety/datasafety.js';
import { memoized } from './features/memoized/memoized.js';

export interface GooglePlayClient {
  BASE_URL: typeof BASE_URL;
  age: typeof age;
  category: typeof category;
  clusters: typeof clusters;
  collection: typeof collection;
  permission: typeof permission;
  sort: typeof sort;
  app: typeof app;
  search: typeof search;
  suggest: typeof suggest;
  list: typeof list;
  categories: typeof categories;
  developer: typeof developer;
  similar: typeof similar;
  reviews: typeof reviews;
  permissions: typeof permissions;
  datasafety: typeof datasafety;
}

const gplay: GooglePlayClient & { memoized: typeof memoized } = {
  BASE_URL,
  age,
  category,
  clusters,
  collection,
  permission,
  sort,
  app,
  search,
  suggest,
  list,
  categories,
  developer,
  similar,
  reviews,
  permissions,
  datasafety,
  memoized,
};

export default gplay;
