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

import { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.js';
import { app } from './features/app/app.js';
import { search } from './features/search/search.js';

const gplay = {
  BASE_URL,
  age,
  category,
  clusters,
  collection,
  permission,
  sort,
  app,
  search,
};

export default gplay;
