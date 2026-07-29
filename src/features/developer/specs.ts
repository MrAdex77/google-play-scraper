import { BASE_URL } from '../../constants.js';
import { isFreeMicros, microsToUnits, resolveAppUrl } from '../../core/appItemTransforms.js';
import type { Path } from '../../core/path.js';
import { defaulted, optional, required, type SpecMap } from '../../core/spec.js';
import { developerAppSchema } from './schema.js';

const shape = developerAppSchema.shape;
const REQUIRED = required();
const OPTIONAL = optional();
const DEFAULT_PRICE = defaulted(() => 0);
const DEFAULT_NOT_FREE = defaulted(() => false);

const NUMERIC_ID = /^\d+$/;

export function isNumericDevId(devId: string): boolean {
  return NUMERIC_ID.test(devId);
}

export function developerUrl(devId: string, lang: string, country: string): string {
  const path = isNumericDevId(devId) ? '/store/apps/dev' : '/store/apps/developer';
  const params = new URLSearchParams({ id: devId, hl: lang, gl: country });
  return `${BASE_URL}${path}?${params.toString()}`;
}

export const NUMERIC_INITIAL_MAPPINGS = {
  apps: ['ds:3', 0, 1, 0, 21, 0],
  token: ['ds:3', 0, 1, 0, 21, 1, 3, 1],
} satisfies Record<string, Path>;

export const NAME_INITIAL_MAPPINGS = {
  apps: ['ds:3', 0, 1, 0, 22, 0],
  token: ['ds:3', 0, 1, 0, 22, 1, 3, 1],
} satisfies Record<string, Path>;

export const CLUSTER_MAPPINGS = {
  apps: [0, 6, 0],
  token: [0, 6, 7, 1],
} satisfies Record<string, Path>;

export const nameItemSpecs = {
  title: { paths: [[0, 3]], missing: REQUIRED, schema: shape.title },
  appId: { paths: [[0, 0, 0]], missing: REQUIRED, schema: shape.appId },
  url: { paths: [[0, 10, 4, 2]], missing: REQUIRED, schema: shape.url, transform: resolveAppUrl },
  icon: { paths: [[0, 1, 3, 2]], missing: REQUIRED, schema: shape.icon },
  developer: { paths: [[0, 14]], missing: REQUIRED, schema: shape.developer },
  currency: { paths: [[0, 8, 1, 0, 1]], missing: OPTIONAL, schema: shape.currency },
  price: {
    paths: [[0, 8, 1, 0, 0]],
    missing: DEFAULT_PRICE,
    schema: shape.price,
    transform: microsToUnits,
  },
  free: {
    paths: [[0, 8, 1, 0, 0]],
    missing: DEFAULT_NOT_FREE,
    schema: shape.free,
    transform: isFreeMicros,
  },
  summary: { paths: [[0, 13, 1]], missing: OPTIONAL, schema: shape.summary },
  scoreText: { paths: [[0, 4, 0]], missing: OPTIONAL, schema: shape.scoreText },
  score: { paths: [[0, 4, 1]], missing: OPTIONAL, schema: shape.score },
} satisfies SpecMap;

export const numericItemSpecs = {
  title: { paths: [[3]], missing: REQUIRED, schema: shape.title },
  appId: { paths: [[0, 0]], missing: REQUIRED, schema: shape.appId },
  url: { paths: [[10, 4, 2]], missing: REQUIRED, schema: shape.url, transform: resolveAppUrl },
  icon: { paths: [[1, 3, 2]], missing: REQUIRED, schema: shape.icon },
  developer: { paths: [[14]], missing: REQUIRED, schema: shape.developer },
  currency: { paths: [[8, 1, 0, 1]], missing: OPTIONAL, schema: shape.currency },
  price: {
    paths: [[8, 1, 0, 0]],
    missing: DEFAULT_PRICE,
    schema: shape.price,
    transform: microsToUnits,
  },
  free: {
    paths: [[8, 1, 0, 0]],
    missing: DEFAULT_NOT_FREE,
    schema: shape.free,
    transform: isFreeMicros,
  },
  summary: { paths: [[13, 1]], missing: OPTIONAL, schema: shape.summary },
  scoreText: { paths: [[4, 0]], missing: OPTIONAL, schema: shape.scoreText },
  score: { paths: [[4, 1]], missing: OPTIONAL, schema: shape.score },
} satisfies SpecMap;
