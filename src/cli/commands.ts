import type gplay from '../index.js';
import { age, category, collection, sort } from '../constants.js';
import type { Sort } from '../constants.js';
import { ValidationError } from '../core/errors.js';
import type { SearchOptions } from '../features/search/search.js';

export type CliApi = Pick<
  typeof gplay,
  | 'app'
  | 'apps'
  | 'search'
  | 'suggest'
  | 'list'
  | 'developer'
  | 'similar'
  | 'reviews'
  | 'permissions'
  | 'datasafety'
  | 'categories'
  | 'availability'
>;

export type CliValues = Record<string, string | boolean | (string | boolean)[] | undefined>;

export type CliFlagConfigs = Record<string, { type: 'string' | 'boolean' }>;

export interface CliCommand {
  name: string;
  summary: string;
  usage: string;
  requiresPositional: boolean;
  options: CliFlagConfigs;
  execute: (positional: string, values: CliValues, api: CliApi) => Promise<unknown>;
}

const baseFlags: CliFlagConfigs = {
  lang: { type: 'string' },
  country: { type: 'string' },
  throttle: { type: 'string' },
};

const BASE_FLAGS_USAGE = '[--lang <code>] [--country <code>] [--throttle <requestsPerSecond>]';

function stringValue(values: CliValues, key: string): string | undefined {
  const value = values[key];
  return typeof value === 'string' ? value : undefined;
}

function numberValue(values: CliValues, key: string): number | undefined {
  const value = stringValue(values, key);
  return value === undefined ? undefined : Number(value);
}

function booleanValue(values: CliValues, key: string): boolean {
  return values[key] === true;
}

function baseOptions(values: CliValues): {
  lang: string | undefined;
  country: string | undefined;
  throttle: number | undefined;
} {
  return {
    lang: stringValue(values, 'lang'),
    country: stringValue(values, 'country'),
    throttle: numberValue(values, 'throttle'),
  };
}

function splitCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function enumValue<T extends string>(
  values: CliValues,
  key: string,
  choices: Readonly<Record<string, T>>,
  context: string,
): T | undefined {
  const value = stringValue(values, key);
  if (value === undefined) {
    return undefined;
  }
  for (const choice of Object.values(choices)) {
    if (choice === value) {
      return choice;
    }
  }
  throw new ValidationError(
    `${context}: ${key} must be one of ${Object.values(choices).join(', ')}`,
  );
}

function sortValue(values: CliValues): Sort | undefined {
  const name = stringValue(values, 'sort');
  if (name === undefined) {
    return undefined;
  }
  for (const [key, value] of Object.entries(sort)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      return value;
    }
  }
  const choices = Object.keys(sort)
    .map((key) => key.toLowerCase())
    .join(', ');
  throw new ValidationError(`reviews: sort must be one of ${choices}`);
}

function priceValue(values: CliValues): SearchOptions['price'] {
  const value = stringValue(values, 'price');
  if (value === undefined || value === 'all' || value === 'free' || value === 'paid') {
    return value;
  }
  throw new ValidationError('search: price must be one of all, free, paid');
}

function countriesValue(values: CliValues): string[] {
  const value = stringValue(values, 'countries');
  if (value === undefined) {
    throw new ValidationError('availability: --countries is required');
  }
  return splitCommaList(value).map((country) => country.toLowerCase());
}

export const commands: readonly CliCommand[] = [
  {
    name: 'app',
    summary: 'full detail of a single application',
    usage: `app <appId> ${BASE_FLAGS_USAGE}`,
    requiresPositional: true,
    options: { ...baseFlags },
    execute: (positional, values, api) => api.app({ appId: positional, ...baseOptions(values) }),
  },
  {
    name: 'apps',
    summary: 'full details for many applications at once',
    usage: `apps <appId,appId,...> [--concurrency <n>] ${BASE_FLAGS_USAGE}`,
    requiresPositional: true,
    options: { ...baseFlags, concurrency: { type: 'string' } },
    execute: (positional, values, api) =>
      api.apps({
        appIds: splitCommaList(positional),
        concurrency: numberValue(values, 'concurrency'),
        ...baseOptions(values),
      }),
  },
  {
    name: 'search',
    summary: 'apps matching a search term',
    usage: `search <term> [--num <n>] [--price all|free|paid] [--full-detail] ${BASE_FLAGS_USAGE}`,
    requiresPositional: true,
    options: {
      ...baseFlags,
      num: { type: 'string' },
      price: { type: 'string' },
      'full-detail': { type: 'boolean' },
    },
    execute: (positional, values, api) =>
      api.search({
        term: positional,
        num: numberValue(values, 'num'),
        price: priceValue(values),
        fullDetail: booleanValue(values, 'full-detail'),
        ...baseOptions(values),
      }),
  },
  {
    name: 'suggest',
    summary: 'search term autocompletions',
    usage: `suggest <term> ${BASE_FLAGS_USAGE}`,
    requiresPositional: true,
    options: { ...baseFlags },
    execute: (positional, values, api) => api.suggest({ term: positional, ...baseOptions(values) }),
  },
  {
    name: 'list',
    summary: 'a ranked collection of apps',
    usage: `list [--collection <name>] [--category <name>] [--age <name>] [--num <n>] [--full-detail] ${BASE_FLAGS_USAGE}`,
    requiresPositional: false,
    options: {
      ...baseFlags,
      collection: { type: 'string' },
      category: { type: 'string' },
      age: { type: 'string' },
      num: { type: 'string' },
      'full-detail': { type: 'boolean' },
    },
    execute: (_positional, values, api) =>
      api.list({
        collection: enumValue(values, 'collection', collection, 'list'),
        category: enumValue(values, 'category', category, 'list'),
        age: enumValue(values, 'age', age, 'list'),
        num: numberValue(values, 'num'),
        fullDetail: booleanValue(values, 'full-detail'),
        ...baseOptions(values),
      }),
  },
  {
    name: 'developer',
    summary: 'other apps by the same developer',
    usage: `developer <devId> [--num <n>] [--full-detail] ${BASE_FLAGS_USAGE}`,
    requiresPositional: true,
    options: { ...baseFlags, num: { type: 'string' }, 'full-detail': { type: 'boolean' } },
    execute: (positional, values, api) =>
      api.developer({
        devId: positional,
        num: numberValue(values, 'num'),
        fullDetail: booleanValue(values, 'full-detail'),
        ...baseOptions(values),
      }),
  },
  {
    name: 'similar',
    summary: 'apps related to a given app',
    usage: `similar <appId> [--full-detail] ${BASE_FLAGS_USAGE}`,
    requiresPositional: true,
    options: { ...baseFlags, 'full-detail': { type: 'boolean' } },
    execute: (positional, values, api) =>
      api.similar({
        appId: positional,
        fullDetail: booleanValue(values, 'full-detail'),
        ...baseOptions(values),
      }),
  },
  {
    name: 'reviews',
    summary: 'user reviews for an app',
    usage: `reviews <appId> [--num <n>] [--sort newest|rating|helpfulness] [--paginate] [--token <token>] ${BASE_FLAGS_USAGE}`,
    requiresPositional: true,
    options: {
      ...baseFlags,
      num: { type: 'string' },
      sort: { type: 'string' },
      paginate: { type: 'boolean' },
      token: { type: 'string' },
    },
    execute: (positional, values, api) =>
      api.reviews({
        appId: positional,
        num: numberValue(values, 'num'),
        sort: sortValue(values),
        paginate: booleanValue(values, 'paginate'),
        nextPaginationToken: stringValue(values, 'token'),
        ...baseOptions(values),
      }),
  },
  {
    name: 'permissions',
    summary: 'permissions an app requests',
    usage: `permissions <appId> [--short] ${BASE_FLAGS_USAGE}`,
    requiresPositional: true,
    options: { ...baseFlags, short: { type: 'boolean' } },
    execute: (positional, values, api) =>
      api.permissions({
        appId: positional,
        short: booleanValue(values, 'short'),
        ...baseOptions(values),
      }),
  },
  {
    name: 'datasafety',
    summary: 'the data safety section of an app',
    usage: `datasafety <appId> ${BASE_FLAGS_USAGE}`,
    requiresPositional: true,
    options: { ...baseFlags },
    execute: (positional, values, api) =>
      api.datasafety({ appId: positional, ...baseOptions(values) }),
  },
  {
    name: 'categories',
    summary: 'the Google Play category taxonomy',
    usage: `categories ${BASE_FLAGS_USAGE}`,
    requiresPositional: false,
    options: { ...baseFlags },
    execute: (_positional, values, api) => api.categories({ ...baseOptions(values) }),
  },
  {
    name: 'availability',
    summary: 'per-country availability of an app',
    usage: `availability <appId> --countries <cc,cc,...> [--concurrency <n>] ${BASE_FLAGS_USAGE}`,
    requiresPositional: true,
    options: { ...baseFlags, countries: { type: 'string' }, concurrency: { type: 'string' } },
    execute: (positional, values, api) =>
      api.availability({
        appId: positional,
        countries: countriesValue(values),
        concurrency: numberValue(values, 'concurrency'),
        ...baseOptions(values),
      }),
  },
];
