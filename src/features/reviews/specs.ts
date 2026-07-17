import { BASE_URL } from '../../constants.js';
import type { Path } from '../../core/path.js';
import type { SpecMap } from '../../core/spec.js';
import { sanitizeText } from '../../core/text.js';
import { reviewSchema } from './schema.js';

export const REVIEWS_RPC_ID = 'UsvDTd';
export const REVIEWS_PER_REQUEST = 150;

const REVIEWS_STATIC_QUERY =
  'rpcids=qnKhOb&f.sid=-697906427155521722&bl=boq_playuiserver_20190903.08_p0';
const REVIEWS_TRAILING_QUERY = 'authuser&soc-app=121&soc-platform=1&soc-device=1&_reqid=1065213';

export function reviewsUrl(lang: string, country: string): string {
  return `${BASE_URL}/_/PlayStoreUi/data/batchexecute?${REVIEWS_STATIC_QUERY}&hl=${lang}&gl=${country}&${REVIEWS_TRAILING_QUERY}`;
}

export function buildInitialReviewsBody(sort: number, appId: string): string {
  return `f.req=%5B%5B%5B%22UsvDTd%22%2C%22%5Bnull%2Cnull%2C%5B2%2C${sort.toString()}%2C%5B${REVIEWS_PER_REQUEST.toString()}%2Cnull%2Cnull%5D%2Cnull%2C%5B%5D%5D%2C%5B%5C%22${appId}%5C%22%2C7%5D%5D%22%2Cnull%2C%22generic%22%5D%5D%5D`;
}

export function buildPaginatedReviewsBody(sort: number, appId: string, withToken: string): string {
  return `f.req=%5B%5B%5B%22UsvDTd%22%2C%22%5Bnull%2Cnull%2C%5B2%2C${sort.toString()}%2C%5B${REVIEWS_PER_REQUEST.toString()}%2Cnull%2C%5C%22${withToken}%5C%22%5D%2Cnull%2C%5B%5D%5D%2C%5B%5C%22${appId}%5C%22%2C7%5D%5D%22%2Cnull%2C%22generic%22%5D%5D%5D`;
}

export const REVIEWS_RESPONSE_PATHS = {
  reviews: [0],
  token: [1, 1],
} satisfies Record<string, Path>;

const shape = reviewSchema.shape;

interface RawCriteria {
  criteria: unknown;
  rating: unknown;
}

function generateDate(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const seconds = Number(value[0]);
  const nanos = Number(value[1]);
  const nanoText = (
    Number.isFinite(nanos) && nanos !== 0 ? nanos.toString().padStart(9, '0') : '000'
  ).substring(0, 3);
  const milliseconds = Number(`${seconds.toString()}${nanoText}`);
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function alwaysNull(): null {
  return null;
}

function emptyToUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function cleanReplyText(value: unknown): string | undefined {
  return emptyToUndefined(sanitizeText(value));
}

function buildCriteria(entry: unknown): RawCriteria {
  if (!Array.isArray(entry)) {
    return { criteria: undefined, rating: null };
  }
  const fields: readonly unknown[] = entry;
  const ratingHolder = fields[1];
  const ratingFields: readonly unknown[] = Array.isArray(ratingHolder) ? ratingHolder : [];
  const rating = ratingFields.length > 0 ? ratingFields[0] : null;
  return { criteria: fields[0], rating };
}

function mapCriterias(value: unknown): RawCriteria[] {
  return Array.isArray(value) ? value.map(buildCriteria) : [];
}

export const reviewItemSpecs = {
  id: { paths: [[0]], schema: shape.id },
  userName: { paths: [[1, 0]], schema: shape.userName },
  userImage: { paths: [[1, 1, 3, 2]], schema: shape.userImage },
  date: { paths: [[5]], schema: shape.date, transform: generateDate },
  score: { paths: [[2]], schema: shape.score },
  title: { paths: [[0]], schema: shape.title, transform: alwaysNull },
  text: { paths: [[4]], schema: shape.text, transform: sanitizeText },
  replyDate: { paths: [[7, 2]], schema: shape.replyDate, transform: generateDate },
  replyText: { paths: [[7, 1]], schema: shape.replyText, transform: cleanReplyText },
  version: { paths: [[10]], schema: shape.version, transform: emptyToUndefined },
  thumbsUp: { paths: [[6]], schema: shape.thumbsUp },
  criterias: { paths: [[12, 0]], schema: shape.criterias, transform: mapCriterias },
} satisfies SpecMap;
