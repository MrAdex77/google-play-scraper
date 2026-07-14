import { LRUCache } from 'lru-cache';
import {
  BASE_URL,
  age,
  category,
  clusters,
  collection,
  permission,
  sort,
} from '../../constants.js';
import type { GooglePlayClient } from '../../index.js';
import { app } from '../app/app.js';
import { createApps } from '../apps/apps.js';
import { categories, type CategoriesOptions } from '../categories/categories.js';
import { datasafety } from '../datasafety/datasafety.js';
import { createDeveloper } from '../developer/developer.js';
import { createList } from '../list/list.js';
import { permissions } from '../permissions/permissions.js';
import { reviews } from '../reviews/reviews.js';
import { createSearch } from '../search/search.js';
import { createSimilar } from '../similar/similar.js';
import { suggest } from '../suggest/suggest.js';

export interface MemoizedOptions {
  maxAgeMs?: number;
  max?: number;
}

const DEFAULT_MAX_AGE_MS = 1000 * 60 * 5;
const DEFAULT_MAX = 1000;

type AsyncMethod<Args, Result> = (options: Args) => Promise<Result>;

type Memoizer = <Args, Result>(
  name: string,
  fn: AsyncMethod<Args, Result>,
) => AsyncMethod<Args, Result>;

function createKeyBuilder(): (name: string, options: unknown) => string {
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

  const encode = (value: unknown): unknown =>
    typeof value === 'function' || value instanceof AbortSignal
      ? `identity:${identityOf(value).toString()}`
      : value;

  return (name, options) =>
    `${name}:${JSON.stringify(options, (_property, value: unknown) => encode(value))}`;
}

function createMemoizer(maxAgeMs: number, max: number): Memoizer {
  const keyFor = createKeyBuilder();
  const lifecycle = new LRUCache<string, () => void>({
    max,
    ttl: maxAgeMs,
    ttlAutopurge: true,
    perf: { now: () => Date.now() },
    dispose: (drop) => {
      drop();
    },
  });

  return <Args, Result>(name: string, fn: AsyncMethod<Args, Result>): AsyncMethod<Args, Result> => {
    const store = new Map<string, Promise<Result>>();

    return (options: Args): Promise<Result> => {
      const key = keyFor(name, options);

      if (lifecycle.has(key)) {
        const cached = store.get(key);
        if (cached !== undefined) {
          return cached;
        }
      }

      const pending = fn(options);
      store.set(key, pending);
      lifecycle.set(key, () => {
        store.delete(key);
      });
      pending.catch(() => {
        store.delete(key);
        lifecycle.delete(key);
      });

      return pending;
    };
  };
}

export function memoized(options?: MemoizedOptions): GooglePlayClient {
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const max = options?.max ?? DEFAULT_MAX;
  const memoize = createMemoizer(maxAgeMs, max);

  const memoApp = memoize('app', app);
  const memoCategories = memoize('categories', (input: CategoriesOptions | undefined) =>
    categories(input),
  );

  return {
    BASE_URL,
    age,
    category,
    clusters,
    collection,
    permission,
    sort,
    app: memoApp,
    apps: createApps(memoApp),
    search: memoize('search', createSearch(memoApp)),
    suggest: memoize('suggest', suggest),
    list: memoize('list', createList(memoApp)),
    categories: (input?: CategoriesOptions) => memoCategories(input),
    developer: memoize('developer', createDeveloper(memoApp)),
    similar: memoize('similar', createSimilar(memoApp)),
    reviews: memoize('reviews', reviews),
    permissions: memoize('permissions', permissions),
    datasafety: memoize('datasafety', datasafety),
  };
}
