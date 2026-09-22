import * as z from 'zod/mini';
import { clientOptionsSchema, createSharedTransport } from '../../client.js';
import {
  buildClientSurface,
  type CachedMethodName,
  type GooglePlayClient,
  type GooglePlayIterators,
  type Passthrough,
} from '../../clientSurface.js';
import { createCallCache } from '../../core/cache.js';
import { parseOptions, type MethodWrapper } from '../../core/options.js';

const DEFAULT_MAX_AGE_MS = 1000 * 60 * 5;
const DEFAULT_MAX = 1000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_ENTRIES = 1_000_000;
const MEMOIZED_CONTEXT = 'memoized';

export const memoizedOptionsSchema = z.extend(clientOptionsSchema, {
  maxAgeMs: z._default(z.int().check(z.positive(), z.lte(MAX_TIMER_DELAY_MS)), DEFAULT_MAX_AGE_MS),
  max: z._default(z.int().check(z.positive(), z.lte(MAX_ENTRIES)), DEFAULT_MAX),
});

export type MemoizedOptions = z.input<typeof memoizedOptionsSchema>;

export interface ClientCache {
  readonly size: number;
  clear(): void;
  invalidate<Name extends CachedMethodName>(
    name: Name,
    options: Parameters<GooglePlayClient[Name]>[0],
  ): boolean;
}

export type MemoizedClient = GooglePlayClient & GooglePlayIterators & { cache: ClientCache };

export function memoized(options?: MemoizedOptions): MemoizedClient {
  const parsed = parseOptions(memoizedOptionsSchema, options ?? {}, MEMOIZED_CONTEXT);
  const { resolveClient, applyDefaults } = createSharedTransport(parsed);
  const cache = createCallCache(parsed);

  const passthrough: Passthrough = (fn) => (callOptions) => fn(applyDefaults(callOptions));
  const cached: MethodWrapper = (name, schema, fn) => passthrough(cache.memoize(name, schema, fn));

  return {
    ...buildClientSurface({ resolveClient, cached, passthrough }),
    cache: {
      get size() {
        return cache.size;
      },
      clear: () => {
        cache.clear();
      },
      invalidate: (name, callOptions) => cache.invalidate(name, applyDefaults(callOptions ?? {})),
    },
  };
}
