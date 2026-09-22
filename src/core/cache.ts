import { normalizeCountry } from './options.js';

const PAYLOAD_NEUTRAL_KEYS: ReadonlySet<string> = new Set([
  'throttle',
  'concurrency',
  'onDegradation',
  'onIntegrityEvent',
  'onRequest',
  'onResponse',
  'onRetry',
]);

const COUNTRY_KEY = 'country';
const COUNTRIES_KEY = 'countries';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

function sortedRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((property) => [property, value[property]]),
  );
}

function normalizeCountries(value: readonly unknown[]): unknown[] {
  return value.map((entry) => (typeof entry === 'string' ? normalizeCountry(entry) : entry));
}

export function createKeyBuilder(): (name: string, parsedOptions: unknown) => string {
  const identities = new WeakMap<WeakKey, number>();
  let nextIdentity = 0;

  const identityOf = (value: WeakKey): number => {
    let identity = identities.get(value);
    if (identity === undefined) {
      nextIdentity += 1;
      identity = nextIdentity;
      identities.set(value, identity);
    }
    return identity;
  };

  const canonical = (key: string, value: unknown): unknown => {
    if (PAYLOAD_NEUTRAL_KEYS.has(key)) {
      return undefined;
    }
    if (typeof value === 'function' || value instanceof AbortSignal) {
      return `identity:${identityOf(value).toString()}`;
    }
    if (key === COUNTRY_KEY && typeof value === 'string') {
      return normalizeCountry(value);
    }
    if (key === COUNTRIES_KEY && Array.isArray(value)) {
      return normalizeCountries(value);
    }
    return isPlainRecord(value) ? sortedRecord(value) : value;
  };

  return (name, parsedOptions) =>
    `${name}:${JSON.stringify(parsedOptions, (key, value: unknown) => canonical(key, value))}`;
}
