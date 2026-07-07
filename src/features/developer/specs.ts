import { BASE_URL } from '../../constants.js';
import type { Path } from '../../core/path.js';
import type { SpecMap } from '../../core/spec.js';
import { developerAppSchema } from './schema.js';

const MICROS_PER_UNIT = 1_000_000;
const shape = developerAppSchema.shape;

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

function resolveUrl(value: unknown): string | undefined {
  return typeof value === 'string' ? new URL(value, BASE_URL).toString() : undefined;
}

function microsToUnits(value: unknown): number {
  return typeof value === 'number' ? value / MICROS_PER_UNIT || 0 : 0;
}

function isFree(value: unknown): boolean {
  return value === 0;
}

export const nameItemSpecs = {
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

export const numericItemSpecs = {
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
