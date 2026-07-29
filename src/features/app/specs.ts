import { getPath } from '../../core/path.js';
import { sanitizeText } from '../../core/text.js';
import { defaulted, optional, required, type SpecMap } from '../../core/spec.js';
import { appSchema } from './schema.js';
import {
  buildHistogram,
  categoriesFromDetail,
  descriptionHtmlLocalized,
  descriptionText,
  developerIdFromUrl,
  extractComments,
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

export const appSpecs = {
  title: { paths: [['ds:5', 1, 2, 0, 0]], missing: REQUIRED, schema: shape.title },
  description: {
    paths: [['ds:5', 1, 2]],
    missing: REQUIRED,
    schema: shape.description,
    transform: (value) => descriptionText(descriptionHtmlLocalized(value)),
  },
  descriptionHTML: {
    paths: [['ds:5', 1, 2]],
    missing: REQUIRED,
    schema: shape.descriptionHTML,
    transform: descriptionHtmlLocalized,
  },
  summary: { paths: [['ds:5', 1, 2, 73, 0, 1]], missing: OPTIONAL, schema: shape.summary },
  installs: { paths: [['ds:5', 1, 2, 13, 0]], missing: OPTIONAL, schema: shape.installs },
  minInstalls: { paths: [['ds:5', 1, 2, 13, 1]], missing: OPTIONAL, schema: shape.minInstalls },
  maxInstalls: { paths: [['ds:5', 1, 2, 13, 2]], missing: OPTIONAL, schema: shape.maxInstalls },
  score: { paths: [['ds:5', 1, 2, 51, 0, 1]], missing: OPTIONAL, schema: shape.score },
  scoreText: { paths: [['ds:5', 1, 2, 51, 0, 0]], missing: OPTIONAL, schema: shape.scoreText },
  ratings: { paths: [['ds:5', 1, 2, 51, 2, 1]], missing: OPTIONAL, schema: shape.ratings },
  reviews: { paths: [['ds:5', 1, 2, 51, 3, 1]], missing: OPTIONAL, schema: shape.reviews },
  histogram: {
    paths: [['ds:5', 1, 2, 51, 1]],
    missing: REQUIRED,
    schema: shape.histogram,
    transform: buildHistogram,
  },
  price: {
    paths: [['ds:5', 1, 2, 57, 0, 0, 0, 0, 1, 0, 0]],
    missing: REQUIRED,
    schema: shape.price,
    transform: microsToUnits,
  },
  originalPrice: {
    paths: [['ds:5', 1, 2, 57, 0, 0, 0, 0, 1, 1, 0]],
    missing: OPTIONAL,
    schema: shape.originalPrice,
    transform: (value) =>
      typeof value === 'number' && value !== 0 ? microsToUnits(value) : undefined,
  },
  discountEndDate: {
    paths: [['ds:5', 1, 2, 57, 0, 0, 0, 0, 14, 1]],
    missing: OPTIONAL,
    schema: shape.discountEndDate,
  },
  free: {
    paths: [['ds:5', 1, 2, 57, 0, 0, 0, 0, 1, 0, 0]],
    missing: REQUIRED,
    schema: shape.free,
    transform: (value) => value === 0,
  },
  currency: {
    paths: [['ds:5', 1, 2, 57, 0, 0, 0, 0, 1, 0, 1]],
    missing: OPTIONAL,
    schema: shape.currency,
  },
  priceText: {
    paths: [['ds:5', 1, 2, 57, 0, 0, 0, 0, 1, 0, 2]],
    missing: REQUIRED,
    schema: shape.priceText,
    transform: priceText,
  },
  available: {
    paths: [['ds:5', 1, 2, 18, 0]],
    missing: REQUIRED,
    schema: shape.available,
    transform: (value) => Boolean(value),
  },
  offersIAP: {
    paths: [['ds:5', 1, 2, 19, 0]],
    missing: OPTIONAL,
    schema: shape.offersIAP,
    transform: (value) => Boolean(value),
  },
  IAPRange: { paths: [['ds:5', 1, 2, 19, 0]], missing: OPTIONAL, schema: shape.IAPRange },
  androidVersion: {
    paths: [
      ['ds:5', 1, 2, 140, 1, 1, 0, 0, 1],
      ['ds:5', 1, 2, -1, '141', 1, 1, 0, 0, 1],
    ],
    missing: DEFAULT_VARY,
    schema: shape.androidVersion,
    transform: normalizeAndroidVersion,
  },
  androidVersionText: {
    paths: [
      ['ds:5', 1, 2, 140, 1, 1, 0, 0, 1],
      ['ds:5', 1, 2, -1, '141', 1, 1, 0, 0, 1],
    ],
    missing: defaulted(() => 'Varies with device'),
    schema: shape.androidVersionText,
    transform: (value) =>
      typeof value === 'string' && value.length > 0 ? value : 'Varies with device',
  },
  androidMaxVersion: {
    paths: [
      ['ds:5', 1, 2, 140, 1, 1, 0, 1, 1],
      ['ds:5', 1, 2, -1, '141', 1, 1, 0, 1, 1],
    ],
    missing: DEFAULT_VARY,
    schema: shape.androidMaxVersion,
    transform: normalizeAndroidVersion,
  },
  developer: { paths: [['ds:5', 1, 2, 68, 0]], missing: REQUIRED, schema: shape.developer },
  developerId: {
    paths: [['ds:5', 1, 2, 68, 1, 4, 2]],
    missing: REQUIRED,
    schema: shape.developerId,
    transform: developerIdFromUrl,
  },
  developerEmail: {
    paths: [['ds:5', 1, 2, 69, 1, 0]],
    missing: OPTIONAL,
    schema: shape.developerEmail,
  },
  developerWebsite: {
    paths: [['ds:5', 1, 2, 69, 0, 5, 2]],
    missing: OPTIONAL,
    schema: shape.developerWebsite,
  },
  developerAddress: {
    paths: [['ds:5', 1, 2, 69, 2, 0]],
    missing: OPTIONAL,
    schema: shape.developerAddress,
  },
  developerLegalName: {
    paths: [['ds:5', 1, 2, 69, 4, 0]],
    missing: OPTIONAL,
    schema: shape.developerLegalName,
  },
  developerLegalEmail: {
    paths: [['ds:5', 1, 2, 69, 4, 1, 0]],
    missing: OPTIONAL,
    schema: shape.developerLegalEmail,
  },
  developerLegalAddress: {
    paths: [['ds:5', 1, 2, 69]],
    missing: OPTIONAL,
    schema: shape.developerLegalAddress,
    transform: (value) => {
      const address = getPath(value, [4, 2, 0]);
      return typeof address === 'string' ? address.replace(/\n/g, ', ') : undefined;
    },
  },
  developerLegalPhoneNumber: {
    paths: [['ds:5', 1, 2, 69, 4, 3]],
    missing: OPTIONAL,
    schema: shape.developerLegalPhoneNumber,
  },
  privacyPolicy: {
    paths: [['ds:5', 1, 2, 99, 0, 5, 2]],
    missing: OPTIONAL,
    schema: shape.privacyPolicy,
  },
  developerInternalID: {
    paths: [['ds:5', 1, 2, 68, 1, 4, 2]],
    missing: REQUIRED,
    schema: shape.developerInternalID,
    transform: developerIdFromUrl,
  },
  genre: { paths: [['ds:5', 1, 2, 79, 0, 0, 0]], missing: REQUIRED, schema: shape.genre },
  genreId: { paths: [['ds:5', 1, 2, 79, 0, 0, 2]], missing: REQUIRED, schema: shape.genreId },
  categories: {
    paths: [['ds:5', 1, 2]],
    missing: REQUIRED,
    schema: shape.categories,
    transform: categoriesFromDetail,
  },
  icon: { paths: [['ds:5', 1, 2, 95, 0, 3, 2]], missing: REQUIRED, schema: shape.icon },
  headerImage: {
    paths: [['ds:5', 1, 2, 96, 0, 3, 2]],
    missing: OPTIONAL,
    schema: shape.headerImage,
  },
  screenshots: {
    paths: [['ds:5', 1, 2, 78, 0]],
    missing: REQUIRED,
    schema: shape.screenshots,
    transform: extractScreenshots,
  },
  video: { paths: [['ds:5', 1, 2, 100, 0, 0, 3, 2]], missing: OPTIONAL, schema: shape.video },
  videoImage: {
    paths: [['ds:5', 1, 2, 100, 1, 0, 3, 2]],
    missing: OPTIONAL,
    schema: shape.videoImage,
  },
  previewVideo: {
    paths: [['ds:5', 1, 2, 100, 1, 2, 0, 2]],
    missing: OPTIONAL,
    schema: shape.previewVideo,
  },
  contentRating: {
    paths: [['ds:5', 1, 2, 9, 0]],
    missing: OPTIONAL,
    schema: shape.contentRating,
  },
  contentRatingDescription: {
    paths: [['ds:5', 1, 2, 9, 2, 1]],
    missing: OPTIONAL,
    schema: shape.contentRatingDescription,
  },
  adSupported: {
    paths: [['ds:5', 1, 2, 48]],
    missing: DEFAULT_FALSE,
    schema: shape.adSupported,
    transform: (value) => Boolean(value),
  },
  released: { paths: [['ds:5', 1, 2, 10, 0]], missing: OPTIONAL, schema: shape.released },
  updated: {
    paths: [
      ['ds:5', 1, 2, 145, 0, 1, 0],
      ['ds:5', 1, 2, -1, '146', 0, 1, 0],
    ],
    missing: REQUIRED,
    schema: shape.updated,
    transform: (value) => (typeof value === 'number' ? value * 1000 : value),
  },
  version: {
    paths: [
      ['ds:5', 1, 2, 140, 0, 0, 0],
      ['ds:5', 1, 2, -1, '141', 0, 0, 0],
    ],
    missing: DEFAULT_VARY,
    schema: shape.version,
    transform: (value) => (typeof value === 'string' && value.length > 0 ? value : 'VARY'),
  },
  recentChanges: {
    paths: [
      ['ds:5', 1, 2, 144, 1, 1],
      ['ds:5', 1, 2, -1, '145', 1, 1],
    ],
    missing: OPTIONAL,
    schema: shape.recentChanges,
    transform: sanitizeText,
  },
  comments: { paths: [[]], missing: REQUIRED, schema: shape.comments, transform: extractComments },
  preregister: {
    paths: [['ds:5', 1, 2, 18, 0]],
    missing: REQUIRED,
    schema: shape.preregister,
    transform: (value) => value === 1,
  },
  earlyAccessEnabled: {
    paths: [['ds:5', 1, 2, 18, 2]],
    missing: DEFAULT_FALSE,
    schema: shape.earlyAccessEnabled,
    transform: (value) => typeof value === 'string',
  },
  isAvailableInPlayPass: {
    paths: [['ds:5', 1, 2, 62]],
    missing: DEFAULT_FALSE,
    schema: shape.isAvailableInPlayPass,
    transform: (value) => Boolean(value),
  },
} satisfies SpecMap;
