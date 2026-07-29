import { getPath } from '../../core/path.js';
import type { ScriptRootSpec } from '../../core/scriptRoot.js';
import { sanitizeText } from '../../core/text.js';
import { defaulted, optional, required, type SpecMap } from '../../core/spec.js';
import * as z from 'zod/mini';
import { appSchema } from './schema.js';
import {
  buildHistogram,
  categoriesFromDetail,
  descriptionHtmlLocalized,
  descriptionText,
  developerIdFromUrl,
  extractScreenshots,
  microsToUnits,
  normalizeAndroidVersion,
  priceText,
} from './transforms.js';

const shape = appSchema.shape;
const REQUIRED = required();
const OPTIONAL = optional();
const DEFAULT_FALSE = defaulted(() => false);
const DEFAULT_VARY = defaulted(() => 'VARY');

export const APP_DETAILS_RPC_ID = 'Ws7gDc';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDetailsRoot(value: unknown): boolean {
  const details = getPath(value, [1, 2]);
  return Array.isArray(details) && details.length > 100;
}

function isPopulatedCommentsRoot(value: unknown): boolean {
  const author = getPath(value, [0, 0, 1, 0]);
  const version = getPath(value, [0, 0, 10]);
  const date = getPath(value, [0, 0, 5, 0]);
  return (
    typeof author === 'string' &&
    author.length > 0 &&
    typeof version === 'string' &&
    version.length > 0 &&
    typeof date === 'number'
  );
}

function isAbsentCommentsRoot(value: unknown): boolean {
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  const emptyMarker = getPath(value, [0, 0, 0]);
  const ratings = getPath(value, [1, 2, 0]);
  return Array.isArray(emptyMarker) && isRecord(ratings) && '52' in ratings;
}

export const appDetailsRootSchema = z.custom<unknown[]>(isDetailsRoot);
export const appCommentsRootSchema = z.custom<unknown[]>(
  (value) => isPopulatedCommentsRoot(value) || isAbsentCommentsRoot(value),
);

export const appDetailsRootSpec = {
  rpcId: APP_DETAILS_RPC_ID,
  paths: [['ds:5']],
  schema: appDetailsRootSchema,
  missing: REQUIRED,
} satisfies ScriptRootSpec;

export const appCommentsRootSpec = {
  rpcId: APP_DETAILS_RPC_ID,
  paths: [['ds:8'], ['ds:9']],
  schema: appCommentsRootSchema,
  missing: defaulted(() => []),
} satisfies ScriptRootSpec;

export const appSpecs = {
  title: { paths: [[1, 2, 0, 0]], missing: REQUIRED, schema: shape.title },
  description: {
    paths: [[1, 2]],
    missing: REQUIRED,
    schema: shape.description,
    transform: (value) => descriptionText(descriptionHtmlLocalized(value)),
  },
  descriptionHTML: {
    paths: [[1, 2]],
    missing: REQUIRED,
    schema: shape.descriptionHTML,
    transform: descriptionHtmlLocalized,
  },
  summary: { paths: [[1, 2, 73, 0, 1]], missing: OPTIONAL, schema: shape.summary },
  installs: { paths: [[1, 2, 13, 0]], missing: OPTIONAL, schema: shape.installs },
  minInstalls: { paths: [[1, 2, 13, 1]], missing: OPTIONAL, schema: shape.minInstalls },
  maxInstalls: { paths: [[1, 2, 13, 2]], missing: OPTIONAL, schema: shape.maxInstalls },
  score: { paths: [[1, 2, 51, 0, 1]], missing: OPTIONAL, schema: shape.score },
  scoreText: { paths: [[1, 2, 51, 0, 0]], missing: OPTIONAL, schema: shape.scoreText },
  ratings: { paths: [[1, 2, 51, 2, 1]], missing: OPTIONAL, schema: shape.ratings },
  reviews: { paths: [[1, 2, 51, 3, 1]], missing: OPTIONAL, schema: shape.reviews },
  histogram: {
    paths: [[1, 2, 51, 1]],
    missing: REQUIRED,
    schema: shape.histogram,
    transform: buildHistogram,
  },
  price: {
    paths: [[1, 2, 57, 0, 0, 0, 0, 1, 0, 0]],
    missing: REQUIRED,
    schema: shape.price,
    transform: microsToUnits,
  },
  originalPrice: {
    paths: [[1, 2, 57, 0, 0, 0, 0, 1, 1, 0]],
    missing: OPTIONAL,
    schema: shape.originalPrice,
    transform: (value) =>
      typeof value === 'number' && value !== 0 ? microsToUnits(value) : undefined,
  },
  discountEndDate: {
    paths: [[1, 2, 57, 0, 0, 0, 0, 14, 1]],
    missing: OPTIONAL,
    schema: shape.discountEndDate,
  },
  free: {
    paths: [[1, 2, 57, 0, 0, 0, 0, 1, 0, 0]],
    missing: REQUIRED,
    schema: shape.free,
    transform: (value) => value === 0,
  },
  currency: {
    paths: [[1, 2, 57, 0, 0, 0, 0, 1, 0, 1]],
    missing: OPTIONAL,
    schema: shape.currency,
  },
  priceText: {
    paths: [[1, 2, 57, 0, 0, 0, 0, 1, 0, 2]],
    missing: REQUIRED,
    schema: shape.priceText,
    transform: priceText,
  },
  available: {
    paths: [[1, 2, 18, 0]],
    missing: REQUIRED,
    schema: shape.available,
    transform: (value) => Boolean(value),
  },
  offersIAP: {
    paths: [[1, 2, 19, 0]],
    missing: OPTIONAL,
    schema: shape.offersIAP,
    transform: (value) => Boolean(value),
  },
  IAPRange: { paths: [[1, 2, 19, 0]], missing: OPTIONAL, schema: shape.IAPRange },
  androidVersion: {
    paths: [
      [1, 2, 140, 1, 1, 0, 0, 1],
      [1, 2, -1, '141', 1, 1, 0, 0, 1],
    ],
    missing: DEFAULT_VARY,
    schema: shape.androidVersion,
    transform: normalizeAndroidVersion,
  },
  androidVersionText: {
    paths: [
      [1, 2, 140, 1, 1, 0, 0, 1],
      [1, 2, -1, '141', 1, 1, 0, 0, 1],
    ],
    missing: defaulted(() => 'Varies with device'),
    schema: shape.androidVersionText,
    transform: (value) =>
      typeof value === 'string' && value.length > 0 ? value : 'Varies with device',
  },
  androidMaxVersion: {
    paths: [
      [1, 2, 140, 1, 1, 0, 1, 1],
      [1, 2, -1, '141', 1, 1, 0, 1, 1],
    ],
    missing: DEFAULT_VARY,
    schema: shape.androidMaxVersion,
    transform: normalizeAndroidVersion,
  },
  developer: { paths: [[1, 2, 68, 0]], missing: REQUIRED, schema: shape.developer },
  developerId: {
    paths: [[1, 2, 68, 1, 4, 2]],
    missing: REQUIRED,
    schema: shape.developerId,
    transform: developerIdFromUrl,
  },
  developerEmail: {
    paths: [[1, 2, 69, 1, 0]],
    missing: OPTIONAL,
    schema: shape.developerEmail,
  },
  developerWebsite: {
    paths: [[1, 2, 69, 0, 5, 2]],
    missing: OPTIONAL,
    schema: shape.developerWebsite,
  },
  developerAddress: {
    paths: [[1, 2, 69, 2, 0]],
    missing: OPTIONAL,
    schema: shape.developerAddress,
  },
  developerLegalName: {
    paths: [[1, 2, 69, 4, 0]],
    missing: OPTIONAL,
    schema: shape.developerLegalName,
  },
  developerLegalEmail: {
    paths: [[1, 2, 69, 4, 1, 0]],
    missing: OPTIONAL,
    schema: shape.developerLegalEmail,
  },
  developerLegalAddress: {
    paths: [[1, 2, 69]],
    missing: OPTIONAL,
    schema: shape.developerLegalAddress,
    transform: (value) => {
      const address = getPath(value, [4, 2, 0]);
      return typeof address === 'string' ? address.replace(/\n/g, ', ') : undefined;
    },
  },
  developerLegalPhoneNumber: {
    paths: [[1, 2, 69, 4, 3]],
    missing: OPTIONAL,
    schema: shape.developerLegalPhoneNumber,
  },
  privacyPolicy: {
    paths: [[1, 2, 99, 0, 5, 2]],
    missing: OPTIONAL,
    schema: shape.privacyPolicy,
  },
  developerInternalID: {
    paths: [[1, 2, 68, 1, 4, 2]],
    missing: REQUIRED,
    schema: shape.developerInternalID,
    transform: developerIdFromUrl,
  },
  genre: { paths: [[1, 2, 79, 0, 0, 0]], missing: REQUIRED, schema: shape.genre },
  genreId: { paths: [[1, 2, 79, 0, 0, 2]], missing: REQUIRED, schema: shape.genreId },
  categories: {
    paths: [[1, 2]],
    missing: REQUIRED,
    schema: shape.categories,
    transform: categoriesFromDetail,
  },
  icon: { paths: [[1, 2, 95, 0, 3, 2]], missing: REQUIRED, schema: shape.icon },
  headerImage: {
    paths: [[1, 2, 96, 0, 3, 2]],
    missing: OPTIONAL,
    schema: shape.headerImage,
  },
  screenshots: {
    paths: [[1, 2, 78, 0]],
    missing: REQUIRED,
    schema: shape.screenshots,
    transform: extractScreenshots,
  },
  video: { paths: [[1, 2, 100, 0, 0, 3, 2]], missing: OPTIONAL, schema: shape.video },
  videoImage: {
    paths: [[1, 2, 100, 1, 0, 3, 2]],
    missing: OPTIONAL,
    schema: shape.videoImage,
  },
  previewVideo: {
    paths: [[1, 2, 100, 1, 2, 0, 2]],
    missing: OPTIONAL,
    schema: shape.previewVideo,
  },
  contentRating: {
    paths: [[1, 2, 9, 0]],
    missing: OPTIONAL,
    schema: shape.contentRating,
  },
  contentRatingDescription: {
    paths: [[1, 2, 9, 2, 1]],
    missing: OPTIONAL,
    schema: shape.contentRatingDescription,
  },
  adSupported: {
    paths: [[1, 2, 48]],
    missing: DEFAULT_FALSE,
    schema: shape.adSupported,
    transform: (value) => Boolean(value),
  },
  released: { paths: [[1, 2, 10, 0]], missing: OPTIONAL, schema: shape.released },
  updated: {
    paths: [
      [1, 2, 145, 0, 1, 0],
      [1, 2, -1, '146', 0, 1, 0],
    ],
    missing: REQUIRED,
    schema: shape.updated,
    transform: (value) => (typeof value === 'number' ? value * 1000 : value),
  },
  version: {
    paths: [
      [1, 2, 140, 0, 0, 0],
      [1, 2, -1, '141', 0, 0, 0],
    ],
    missing: DEFAULT_VARY,
    schema: shape.version,
    transform: (value) => (typeof value === 'string' && value.length > 0 ? value : 'VARY'),
  },
  recentChanges: {
    paths: [
      [1, 2, 144, 1, 1],
      [1, 2, -1, '145', 1, 1],
    ],
    missing: OPTIONAL,
    schema: shape.recentChanges,
    transform: sanitizeText,
  },
  preregister: {
    paths: [[1, 2, 18, 0]],
    missing: REQUIRED,
    schema: shape.preregister,
    transform: (value) => value === 1,
  },
  earlyAccessEnabled: {
    paths: [[1, 2, 18, 2]],
    missing: DEFAULT_FALSE,
    schema: shape.earlyAccessEnabled,
    transform: (value) => typeof value === 'string',
  },
  isAvailableInPlayPass: {
    paths: [[1, 2, 62]],
    missing: DEFAULT_FALSE,
    schema: shape.isAvailableInPlayPass,
    transform: (value) => Boolean(value),
  },
} satisfies SpecMap;
