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

import { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.js';
import { app } from './features/app/app.js';
import { search } from './features/search/search.js';
import { suggest } from './features/suggest/suggest.js';
import { list } from './features/list/list.js';
import { categories } from './features/categories/categories.js';
import { developer } from './features/developer/developer.js';

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
  suggest,
  list,
  categories,
  developer,
};

export default gplay;
