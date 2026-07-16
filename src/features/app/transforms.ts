import { htmlToPlainText } from '../../core/htmlText.js';
import { getPath } from '../../core/path.js';
import { sanitizeText } from '../../core/text.js';
import type { AppCategory } from './schema.js';

const COMMENT_ROOTS = ['ds:8', 'ds:9'] as const;
const MAX_COMMENTS = 5;
const MICROS_PER_UNIT = 1_000_000;

export function descriptionHtmlLocalized(value: unknown): string | undefined {
  const translated = getPath(value, [12, 0, 0, 1]);
  const original = getPath(value, [72, 0, 1]);
  const resolved = typeof translated === 'string' && translated.length > 0 ? translated : original;
  return sanitizeText(resolved);
}

export function descriptionText(html: unknown): string | undefined {
  if (typeof html !== 'string') {
    return undefined;
  }
  return sanitizeText(htmlToPlainText(html));
}

export function priceText(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : 'Free';
}

export function normalizeAndroidVersion(value: unknown): string {
  if (typeof value !== 'string') {
    return 'VARY';
  }
  const token = value.split(' ')[0];
  if (token !== undefined && parseFloat(token)) {
    return token;
  }
  return 'VARY';
}

export function buildHistogram(container: unknown): Record<number, number> {
  return {
    1: histogramCount(container, 1),
    2: histogramCount(container, 2),
    3: histogramCount(container, 3),
    4: histogramCount(container, 4),
    5: histogramCount(container, 5),
  };
}

function histogramCount(container: unknown, star: number): number {
  const bucket = getPath(container, [star, 1]);
  return typeof bucket === 'number' ? bucket : 0;
}

export function microsToUnits(value: unknown): number {
  if (typeof value !== 'number') {
    return 0;
  }
  return value / MICROS_PER_UNIT || 0;
}

export function developerIdFromUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.split('id=')[1];
}

export function extractComments(source: unknown): string[] {
  for (const root of COMMENT_ROOTS) {
    const author = getPath(source, [root, 0, 0, 1, 0]);
    const version = getPath(source, [root, 0, 0, 10]);
    const date = getPath(source, [root, 0, 0, 5, 0]);
    if (author && version && date) {
      const comments = getPath(source, [root, 0]);
      if (Array.isArray(comments)) {
        return comments
          .map((comment) => getPath(comment, [4]))
          .filter((text): text is string => typeof text === 'string')
          .slice(0, MAX_COMMENTS);
      }
    }
  }
  return [];
}

export function extractScreenshots(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((shot) => getPath(shot, [3, 2]))
    .filter((url): url is string => typeof url === 'string');
}

export function extractCategories(value: unknown, categories: AppCategory[] = []): AppCategory[] {
  if (!Array.isArray(value) || value.length === 0) {
    return categories;
  }
  if (value.length >= 4 && typeof value[0] === 'string') {
    categories.push({ name: value[0], id: nullableString(value[2]) });
    return categories;
  }
  for (const sub of value) {
    extractCategories(sub, categories);
  }
  return categories;
}

export function categoriesFromDetail(value: unknown): AppCategory[] {
  const categories = extractCategories(getPath(value, [118]));
  if (categories.length > 0) {
    return categories;
  }
  const name = getPath(value, [79, 0, 0, 0]);
  if (typeof name === 'string') {
    return [{ name, id: nullableString(getPath(value, [79, 0, 0, 2])) }];
  }
  return categories;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
