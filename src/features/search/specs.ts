import { BASE_URL } from '../../constants.js';
import type { Path } from '../../core/path.js';
import type { SpecMap } from '../../core/spec.js';
import { searchResultSchema } from './schema.js';

const MICROS_PER_UNIT = 1_000_000;
const shape = searchResultSchema.shape;

export type PriceFilter = 'all' | 'free' | 'paid';

function resolveUrl(value: unknown): string | undefined {
  return typeof value === 'string' ? new URL(value, BASE_URL).toString() : undefined;
}

function microsToUnits(value: unknown): number {
  return typeof value === 'number' ? value / MICROS_PER_UNIT || 0 : 0;
}

function isFree(value: unknown): boolean {
  return value === 0;
}

function developerIdFromLink(value: unknown): string | undefined {
  return typeof value === 'string' ? value.split('?id=')[1] : undefined;
}

export const INITIAL_MAPPINGS = {
  app: ['ds:4', 0, 1, 0, 23],
  sections: ['ds:4', 0, 1],
} satisfies Record<string, Path>;

export const SECTIONS_MAPPING = {
  apps: [22, 0],
  token: [22, 1, 3, 1],
} satisfies Record<string, Path>;

export const CLUSTER_MAPPINGS = {
  apps: [0, 0, 0],
  token: [0, 0, 7, 1],
} satisfies Record<string, Path>;

export const searchItemSpecs = {
  title: { paths: [[0, 3]], schema: shape.title },
  appId: { paths: [[0, 0, 0]], schema: shape.appId },
  url: { paths: [[0, 10, 4, 2]], schema: shape.url, transform: resolveUrl },
  icon: { paths: [[0, 1, 3, 2]], schema: shape.icon },
  developer: { paths: [[0, 14]], schema: shape.developer },
  currency: { paths: [[0, 8, 1, 0, 1]], schema: shape.currency },
  price: { paths: [[0, 8, 1, 0, 0]], schema: shape.price, transform: microsToUnits },
  free: { paths: [[0, 8, 1, 0, 0]], schema: shape.free, transform: isFree },
  summary: { paths: [[0, 13, 1]], schema: shape.summary },
  scoreText: { paths: [[0, 4, 0]], schema: shape.scoreText },
  score: { paths: [[0, 4, 1]], schema: shape.score },
} satisfies SpecMap;

export const searchPageItemSpecs = {
  title: { paths: [[3]], schema: shape.title },
  appId: { paths: [[0, 0]], schema: shape.appId },
  url: { paths: [[10, 4, 2]], schema: shape.url, transform: resolveUrl },
  icon: { paths: [[1, 3, 2]], schema: shape.icon },
  developer: { paths: [[14]], schema: shape.developer },
  currency: { paths: [[8, 1, 0, 1]], schema: shape.currency },
  price: { paths: [[8, 1, 0, 0]], schema: shape.price, transform: microsToUnits },
  free: { paths: [[8, 1, 0, 0]], schema: shape.free, transform: isFree },
  summary: { paths: [[13, 1]], schema: shape.summary },
  scoreText: { paths: [[4, 0]], schema: shape.scoreText },
  score: { paths: [[4, 1]], schema: shape.score },
} satisfies SpecMap;

export const exactMatchSpecs = {
  title: { paths: [[16, 2, 0, 0]], schema: shape.title },
  appId: { paths: [[16, 3, '12', 0, 0]], schema: shape.appId },
  url: { paths: [[17, 0, 0, 4, 2]], schema: shape.url, transform: resolveUrl },
  icon: { paths: [[16, 2, 95, 0, 3, 2]], schema: shape.icon },
  developer: { paths: [[16, 2, 68, 0]], schema: shape.developer },
  developerId: {
    paths: [[16, 2, 68, 1, 4, 2]],
    schema: shape.developerId,
    transform: developerIdFromLink,
  },
  currency: { paths: [[17, 0, 2, 0, 1, 0, 1]], schema: shape.currency },
  price: { paths: [[17, 0, 2, 0, 1, 0, 0]], schema: shape.price, transform: microsToUnits },
  free: { paths: [[17, 0, 2, 0, 1, 0, 0]], schema: shape.free, transform: isFree },
  summary: { paths: [[16, 2, 73, 0, 1]], schema: shape.summary },
  scoreText: { paths: [[16, 2, 51, 0, 0]], schema: shape.scoreText },
  score: { paths: [[16, 2, 51, 0, 1]], schema: shape.score },
} satisfies SpecMap;

export function priceGoogleValue(value: PriceFilter): number {
  switch (value) {
    case 'free':
      return 1;
    case 'paid':
      return 2;
    default:
      return 0;
  }
}
