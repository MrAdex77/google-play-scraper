import { BASE_URL } from '../constants.js';
import { appItemSchema } from './appItem.js';
import type { SpecMap } from './spec.js';

const shape = appItemSchema.shape;
const PRICE_NUMBER = /([0-9.,]+)/;

function resolveUrl(value: unknown): string | undefined {
  return typeof value === 'string' ? new URL(value, BASE_URL).toString() : undefined;
}

function priceFromText(value: unknown): number {
  if (typeof value !== 'string') {
    return 0;
  }
  const match = PRICE_NUMBER.exec(value);
  return match === null ? 0 : Number.parseFloat(match[0]);
}

function isFreeText(value: unknown): boolean {
  return value === undefined || value === null;
}

export const clusterItemSpecs = {
  title: { paths: [[2]], schema: shape.title },
  appId: { paths: [[12, 0]], schema: shape.appId },
  url: { paths: [[9, 4, 2]], schema: shape.url, transform: resolveUrl },
  icon: { paths: [[1, 1, 0, 3, 2]], schema: shape.icon },
  developer: { paths: [[4, 0, 0, 0]], schema: shape.developer },
  currency: { paths: [[7, 0, 3, 2, 1, 0, 1]], schema: shape.currency },
  price: { paths: [[7, 0, 3, 2, 1, 0, 2]], schema: shape.price, transform: priceFromText },
  free: { paths: [[7, 0, 3, 2, 1, 0, 2]], schema: shape.free, transform: isFreeText },
  summary: { paths: [[4, 1, 1, 1, 1]], schema: shape.summary },
  scoreText: { paths: [[6, 0, 2, 1, 0]], schema: shape.scoreText },
  score: { paths: [[6, 0, 2, 1, 1]], schema: shape.score },
} satisfies SpecMap;
