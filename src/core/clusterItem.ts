import { BASE_URL } from '../constants.ts';
import { appItemSchema } from './appItem.ts';
import { isFreeMicros, microsToUnits } from './appItemTransforms.ts';
import { defaulted, optional, required, type SpecMap } from './spec.ts';

const shape = appItemSchema.shape;
const OFFER_MICROS_PATH = [7, 0, 3, 2, 1, 0, 0];

function resolveUrl(value: unknown): string | undefined {
  return typeof value === 'string' ? new URL(value, BASE_URL).toString() : undefined;
}

export const clusterItemSpecs = {
  title: { paths: [[2]], missing: required(), schema: shape.title },
  appId: { paths: [[12, 0]], missing: required(), schema: shape.appId },
  url: { paths: [[9, 4, 2]], missing: required(), schema: shape.url, transform: resolveUrl },
  icon: { paths: [[1, 1, 0, 3, 2]], missing: required(), schema: shape.icon },
  developer: { paths: [[4, 0, 0, 0]], missing: required(), schema: shape.developer },
  currency: { paths: [[7, 0, 3, 2, 1, 0, 1]], missing: optional(), schema: shape.currency },
  price: {
    paths: [OFFER_MICROS_PATH],
    missing: defaulted(() => 0),
    schema: shape.price,
    transform: microsToUnits,
  },
  free: {
    paths: [OFFER_MICROS_PATH],
    missing: defaulted(() => true),
    schema: shape.free,
    transform: isFreeMicros,
  },
  summary: { paths: [[4, 1, 1, 1, 1]], missing: optional(), schema: shape.summary },
  scoreText: { paths: [[6, 0, 2, 1, 0]], missing: optional(), schema: shape.scoreText },
  score: { paths: [[6, 0, 2, 1, 1]], missing: optional(), schema: shape.score },
} satisfies SpecMap;
