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

import { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.js';
import { app } from './features/app/app.js';

const gplay = {
  BASE_URL,
  age,
  category,
  clusters,
  collection,
  permission,
  sort,
  app,
};

export default gplay;
