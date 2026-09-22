import { LRUCache } from 'lru-cache';
import type * as z from 'zod/mini';
import type { DegradationEvent } from './degradation.js';
import type { IntegrityEvent } from './integrity.js';
import {
  normalizeCountry,
  parseOptions,
  type MethodWrapper,
  type ObservabilityOptions,
  type ObservableSchema,
  type SchemaBoundMethod,
} from './options.js';

export interface CacheSettings {
  maxAgeMs: number;
  max: number;
}

export interface CallCache {
  readonly size: number;
  memoize: MethodWrapper;
  invalidate(name: string, options: unknown): boolean;
  clear(): void;
}

type RecordedEvent =
  | { channel: 'degradation'; event: DegradationEvent }
  | { channel: 'integrity'; event: IntegrityEvent };

interface CacheEntry<Result> {
  promise: Promise<Result>;
  events: RecordedEvent[];
}

const PAYLOAD_NEUTRAL_OPTIONS: ReadonlySet<string> = new Set([
  'throttle',
  'concurrency',
  'onDegradation',
  'onIntegrityEvent',
]);

const PAYLOAD_NEUTRAL_REQUEST_OPTIONS: ReadonlySet<string> = new Set([
  'onRequest',
  'onResponse',
  'onRetry',
]);

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

function withoutProperties(
  value: Record<string, unknown>,
  excluded: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([property]) => !excluded.has(property)));
}

function normalizeCountries(value: readonly unknown[]): unknown[] {
  return value.map((entry) => (typeof entry === 'string' ? normalizeCountry(entry) : entry));
}

function payloadRequestOptions(requestOptions: unknown): unknown {
  if (!isPlainRecord(requestOptions)) {
    return requestOptions;
  }
  const payload = withoutProperties(requestOptions, PAYLOAD_NEUTRAL_REQUEST_OPTIONS);
  return Object.keys(payload).length > 0 ? payload : undefined;
}

function payloadOptions(parsedOptions: unknown): unknown {
  if (!isPlainRecord(parsedOptions)) {
    return parsedOptions;
  }
  const { country, countries, requestOptions } = parsedOptions;
  return {
    ...withoutProperties(parsedOptions, PAYLOAD_NEUTRAL_OPTIONS),
    country: typeof country === 'string' ? normalizeCountry(country) : country,
    countries: Array.isArray(countries) ? normalizeCountries(countries) : countries,
    requestOptions: payloadRequestOptions(requestOptions),
  };
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

  const canonical = (value: unknown): unknown => {
    if (typeof value === 'function' || value instanceof AbortSignal) {
      return `identity:${identityOf(value).toString()}`;
    }
    return isPlainRecord(value) ? sortedRecord(value) : value;
  };

  return (name, parsedOptions) =>
    `${name}:${JSON.stringify(payloadOptions(parsedOptions), (_key, value: unknown) => canonical(value))}`;
}

function deliver(events: readonly RecordedEvent[], callbacks: ObservabilityOptions): void {
  for (const recorded of events) {
    if (recorded.channel === 'degradation') {
      callbacks.onDegradation?.(recorded.event);
    } else {
      callbacks.onIntegrityEvent?.(recorded.event);
    }
  }
}

export function createCallCache(settings: CacheSettings): CallCache {
  const keyFor = createKeyBuilder();
  const keyBuilders = new Map<string, (options: unknown) => string>();
  const lifecycle = new LRUCache<string, () => void>({
    max: settings.max,
    ttl: settings.maxAgeMs,
    ttlAutopurge: true,
    perf: { now: () => Date.now() },
    dispose: (drop) => {
      drop();
    },
  });

  const memoize: MethodWrapper = <Schema extends ObservableSchema, Result>(
    name: string,
    schema: Schema,
    fn: SchemaBoundMethod<Schema, Result>,
  ): SchemaBoundMethod<Schema, Result> => {
    const store = new Map<string, CacheEntry<Result>>();
    const keyOf = (options: unknown): string => keyFor(name, parseOptions(schema, options, name));
    keyBuilders.set(name, keyOf);

    const begin = (key: string, options: z.input<Schema>): CacheEntry<Result> => {
      const events: RecordedEvent[] = [];
      const recorders: ObservabilityOptions = {
        onDegradation: (event) => {
          events.push({ channel: 'degradation', event });
        },
        onIntegrityEvent: (event) => {
          events.push({ channel: 'integrity', event });
        },
      };
      const entry: CacheEntry<Result> = { promise: fn({ ...options, ...recorders }), events };
      store.set(key, entry);
      lifecycle.set(key, () => {
        store.delete(key);
      });
      entry.promise.catch(() => {
        if (store.get(key) === entry) {
          lifecycle.delete(key);
        }
      });
      return entry;
    };

    return async (options) => {
      const key = keyOf(options);
      const cached = lifecycle.get(key) === undefined ? undefined : store.get(key);
      const entry = cached ?? begin(key, options);
      try {
        return await entry.promise;
      } finally {
        deliver(entry.events, options);
      }
    };
  };

  return {
    memoize,
    invalidate: (name, options) => {
      const keyOf = keyBuilders.get(name);
      return keyOf !== undefined && lifecycle.delete(keyOf(options));
    },
    clear: () => {
      lifecycle.clear();
    },
    get size() {
      return lifecycle.size;
    },
  };
}
