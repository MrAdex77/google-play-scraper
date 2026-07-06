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

import { BASE_URL, age, category, clusters, collection, permission, sort } from './constants.js';

const gplay = {
  BASE_URL,
  age,
  category,
  clusters,
  collection,
  permission,
  sort,
};

export default gplay;
