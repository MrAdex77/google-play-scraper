import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod/mini';
import { createCallCache, createKeyBuilder } from './cache.js';
import type { DegradationEvent } from './degradation.js';
import { ParseError, ValidationError } from './errors.js';
import type { IntegrityEvent } from './integrity.js';
import { baseOptionsSchema, type ObservabilityOptions } from './options.js';

const optionsSchema = z.extend(baseOptionsSchema, {
  id: z.string().check(z.minLength(1)),
});

type Options = z.input<typeof optionsSchema>;

interface Deferred {
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}

const degradation = (context: string): DegradationEvent => ({
  context,
  reason: 'cluster-page-parse',
  error: new ParseError(`${context} degraded`),
});

const integrity = (context: string): IntegrityEvent => ({
  context,
  reason: 'optional-section-parse',
  error: new ParseError(`${context} skipped`),
});

const settings = { maxAgeMs: 1000, max: 10 };

afterEach(() => {
  vi.useRealTimers();
});

describe('createKeyBuilder', () => {
  const keyFor = createKeyBuilder();

  it('drops pacing and callback options from the key', () => {
    const plain = keyFor('app', { id: 'a', lang: 'en', country: 'us' });
    const noisy = keyFor('app', {
      id: 'a',
      lang: 'en',
      country: 'us',
      throttle: 3,
      concurrency: 2,
      onDegradation: () => undefined,
      onIntegrityEvent: () => undefined,
      requestOptions: {
        onRequest: () => undefined,
        onResponse: () => undefined,
        onRetry: () => undefined,
      },
    });

    expect(noisy).toBe(plain);
    expect(keyFor('app', { id: 'a', lang: 'en', country: 'us', requestOptions: {} })).toBe(plain);
  });

  it('sorts properties at every depth', () => {
    const first = keyFor('app', {
      id: 'a',
      requestOptions: { timeoutMs: 1, headers: { b: '2', a: '1' } },
      lang: 'en',
    });
    const second = keyFor('app', {
      lang: 'en',
      requestOptions: { headers: { a: '1', b: '2' }, timeoutMs: 1 },
      id: 'a',
    });

    expect(first).toBe(second);
  });

  it('lowercases country and countries and leaves other entries alone', () => {
    expect(keyFor('app', { country: 'US' })).toBe(keyFor('app', { country: 'us' }));
    expect(keyFor('availability', { countries: ['US', 'pl', 7] })).toBe(
      keyFor('availability', { countries: ['us', 'PL', 7] }),
    );
  });

  it('normalizes only top-level options and leaves same-named headers in the key', () => {
    const headers = (country: string, throttle: string) =>
      keyFor('app', { requestOptions: { headers: { country, throttle } } });

    expect(headers('PL', '1')).not.toBe(headers('pl', '1'));
    expect(headers('pl', '1')).not.toBe(headers('pl', '2'));
  });

  it('keys options that are not a plain object as given', () => {
    expect(keyFor('suggest', 'term')).toBe('suggest:"term"');
  });

  it('keys functions and signals by identity', () => {
    const fetchImpl: typeof fetch = () => Promise.reject(new Error('unused'));
    const otherFetch: typeof fetch = () => Promise.reject(new Error('unused'));
    const signal = new AbortController().signal;

    expect(keyFor('app', { requestOptions: { fetchImpl } })).toBe(
      keyFor('app', { requestOptions: { fetchImpl } }),
    );
    expect(keyFor('app', { requestOptions: { fetchImpl } })).not.toBe(
      keyFor('app', { requestOptions: { fetchImpl: otherFetch } }),
    );
    expect(keyFor('app', { requestOptions: { signal } })).toBe(
      keyFor('app', { requestOptions: { signal } }),
    );
    expect(keyFor('app', { requestOptions: { signal } })).not.toBe(
      keyFor('app', { requestOptions: { signal: new AbortController().signal } }),
    );
  });

  it('separates methods that share option shapes', () => {
    expect(keyFor('app', { id: 'a' })).not.toBe(keyFor('similar', { id: 'a' }));
  });
});

describe('createCallCache', () => {
  const countingMethod = () => {
    const calls: Options[] = [];
    const fn = (options: Options): Promise<string> => {
      calls.push(options);
      return Promise.resolve(`result:${options.id}`);
    };
    return { calls, fn };
  };

  const deferredMethod = () => {
    const pending: Deferred[] = [];
    const fn = (): Promise<string> =>
      new Promise<string>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    return { pending, fn };
  };

  const emittingMethod = (events: readonly (DegradationEvent | IntegrityEvent)[]) => {
    let calls = 0;
    const fn = (options: Options & ObservabilityOptions): Promise<string> => {
      calls += 1;
      for (const event of events) {
        if (event.reason === 'cluster-page-parse') {
          options.onDegradation?.(event);
        } else {
          options.onIntegrityEvent?.(event);
        }
      }
      return Promise.resolve(`result:${options.id}`);
    };
    return { fn, callCount: () => calls };
  };

  it('keys on parsed options so defaults, casing, and order collapse into one entry', async () => {
    const cache = createCallCache(settings);
    const { calls, fn } = countingMethod();
    const method = cache.memoize('app', optionsSchema, fn);

    await method({ id: 'a' });
    await method({ id: 'a', lang: 'en', country: 'us' });
    await method({ country: 'US', id: 'a' });
    await method({ id: 'a', throttle: 2, onDegradation: () => undefined });

    expect(calls).toHaveLength(1);
    expect(cache.size).toBe(1);

    await method({ id: 'a', country: 'pl' });
    expect(calls).toHaveLength(2);
  });

  it('shares one in-flight promise between concurrent identical misses', async () => {
    const cache = createCallCache(settings);
    const { pending, fn } = deferredMethod();
    const method = cache.memoize('app', optionsSchema, fn);

    const first = method({ id: 'a' });
    const second = method({ id: 'a' });
    expect(pending).toHaveLength(1);

    pending[0]?.resolve('shared');
    await expect(first).resolves.toBe('shared');
    await expect(second).resolves.toBe('shared');
  });

  it('evicts a rejected miss so the next call retries', async () => {
    const cache = createCallCache(settings);
    const { pending, fn } = deferredMethod();
    const method = cache.memoize('app', optionsSchema, fn);

    const failed = method({ id: 'a' });
    pending[0]?.reject(new Error('boom'));
    await expect(failed).rejects.toThrow('boom');
    expect(cache.size).toBe(0);

    const retried = method({ id: 'a' });
    expect(pending).toHaveLength(2);
    pending[1]?.resolve('ok');
    await expect(retried).resolves.toBe('ok');
  });

  it('delivers events recorded before a rejection to every caller of the failed miss', async () => {
    const cache = createCallCache(settings);
    const { pending, fn } = deferredMethod();
    const emitThenFail = (options: Options & ObservabilityOptions): Promise<string> => {
      const promise = fn();
      options.onDegradation?.(degradation('search'));
      return promise;
    };
    const method = cache.memoize('search', optionsSchema, emitThenFail);
    const seen: string[] = [];

    const first = method({
      id: 'a',
      onDegradation: (event) => {
        seen.push(`first:${event.reason}`);
      },
    });
    const second = method({
      id: 'a',
      onDegradation: (event) => {
        seen.push(`second:${event.reason}`);
      },
    });
    pending[0]?.reject(new Error('boom'));

    await expect(first).rejects.toThrow('boom');
    await expect(second).rejects.toThrow('boom');
    expect(seen).toEqual(['first:cluster-page-parse', 'second:cluster-page-parse']);
    expect(cache.size).toBe(0);
  });

  it('keeps a replacement entry when an invalidated miss rejects late', async () => {
    const cache = createCallCache(settings);
    const { pending, fn } = deferredMethod();
    const method = cache.memoize('app', optionsSchema, fn);

    const stale = method({ id: 'a' });
    expect(cache.invalidate('app', { id: 'a' })).toBe(true);
    const fresh = method({ id: 'a' });
    expect(pending).toHaveLength(2);

    pending[0]?.reject(new Error('late failure'));
    await expect(stale).rejects.toThrow('late failure');
    expect(cache.size).toBe(1);

    pending[1]?.resolve('fresh');
    await expect(fresh).resolves.toBe('fresh');
    await expect(method({ id: 'a' })).resolves.toBe('fresh');
    expect(pending).toHaveLength(2);
  });

  it('expires entries after maxAgeMs and reports it through size', async () => {
    vi.useFakeTimers();
    const cache = createCallCache(settings);
    const { calls, fn } = countingMethod();
    const method = cache.memoize('app', optionsSchema, fn);

    await method({ id: 'a' });
    expect(cache.size).toBe(1);

    await vi.advanceTimersByTimeAsync(settings.maxAgeMs + 1);
    expect(cache.size).toBe(0);

    await method({ id: 'a' });
    expect(calls).toHaveLength(2);
  });

  it('keeps an in-flight miss past maxAgeMs and starts its age on fulfillment', async () => {
    vi.useFakeTimers();
    const cache = createCallCache(settings);
    const { pending, fn } = deferredMethod();
    const method = cache.memoize('app', optionsSchema, fn);

    const first = method({ id: 'a' });
    await vi.advanceTimersByTimeAsync(settings.maxAgeMs * 3);
    expect(cache.size).toBe(1);

    const joined = method({ id: 'a' });
    expect(pending).toHaveLength(1);

    pending[0]?.resolve('slow');
    await expect(first).resolves.toBe('slow');
    await expect(joined).resolves.toBe('slow');

    await vi.advanceTimersByTimeAsync(settings.maxAgeMs - 1);
    await expect(method({ id: 'a' })).resolves.toBe('slow');
    expect(pending).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2);
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry and counts a hit as use', async () => {
    const cache = createCallCache({ maxAgeMs: 1000, max: 2 });
    const { calls, fn } = countingMethod();
    const method = cache.memoize('app', optionsSchema, fn);

    await method({ id: 'a' });
    await method({ id: 'b' });
    await method({ id: 'a' });
    await method({ id: 'c' });
    expect(cache.size).toBe(2);

    await method({ id: 'a' });
    expect(calls.map((options) => options.id)).toEqual(['a', 'b', 'c']);

    await method({ id: 'b' });
    expect(calls.map((options) => options.id)).toEqual(['a', 'b', 'c', 'b']);
  });

  it('invalidates one entry and leaves the rest untouched', async () => {
    const cache = createCallCache(settings);
    const { calls, fn } = countingMethod();
    const method = cache.memoize('app', optionsSchema, fn);

    await method({ id: 'a' });
    await method({ id: 'b' });
    expect(cache.invalidate('app', { id: 'A' })).toBe(false);
    expect(cache.invalidate('app', { id: 'a', country: 'US' })).toBe(true);
    expect(cache.invalidate('unknown', { id: 'a' })).toBe(false);
    expect(cache.size).toBe(1);

    await method({ id: 'a' });
    await method({ id: 'b' });
    expect(calls.map((options) => options.id)).toEqual(['a', 'b', 'a']);
  });

  it('clears every entry across methods', async () => {
    const cache = createCallCache(settings);
    const app = cache.memoize('app', optionsSchema, countingMethod().fn);
    const similar = cache.memoize('similar', optionsSchema, countingMethod().fn);

    await app({ id: 'a' });
    await similar({ id: 'a' });
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('rejects invalid options without creating an entry', async () => {
    const cache = createCallCache(settings);
    const { calls, fn } = countingMethod();
    const method = cache.memoize('app', optionsSchema, fn);

    await expect(method({ id: '' })).rejects.toBeInstanceOf(ValidationError);
    await expect(method({ id: '' })).rejects.toThrow(/^app:/);
    expect(() => cache.invalidate('app', { id: '' })).toThrow(/^app:/);
    expect(calls).toHaveLength(0);
    expect(cache.size).toBe(0);
  });

  it('replays recorded events in order to every caller, across a callback boundary', async () => {
    const cache = createCallCache(settings);
    const emitted = [degradation('search'), integrity('search'), degradation('search')];
    const { fn, callCount } = emittingMethod(emitted);
    const method = cache.memoize('search', optionsSchema, fn);

    await method({ id: 'a' });

    const received: string[] = [];
    await method({
      id: 'a',
      onDegradation: (event) => {
        received.push(`degradation:${event.error.message}`);
      },
      onIntegrityEvent: (event) => {
        received.push(`integrity:${event.error.message}`);
      },
    });

    expect(callCount()).toBe(1);
    expect(received).toEqual([
      'degradation:search degraded',
      'integrity:search skipped',
      'degradation:search degraded',
    ]);
  });

  it('delivers events to the caller that missed and to a concurrent joiner', async () => {
    const cache = createCallCache(settings);
    const { pending, fn } = deferredMethod();
    const emit = (options: Options & ObservabilityOptions): Promise<string> => {
      const promise = fn();
      options.onIntegrityEvent?.(integrity('app'));
      return promise;
    };
    const method = cache.memoize('app', optionsSchema, emit);
    const seen: string[] = [];

    const first = method({
      id: 'a',
      onIntegrityEvent: () => {
        seen.push('first');
      },
    });
    const second = method({
      id: 'a',
      onIntegrityEvent: () => {
        seen.push('second');
      },
    });
    expect(seen).toEqual([]);

    pending[0]?.resolve('ok');
    await Promise.all([first, second]);
    expect(seen).toEqual(['first', 'second']);
  });

  it('rejects only the caller whose replayed callback throws and keeps the entry', async () => {
    const cache = createCallCache(settings);
    const { fn, callCount } = emittingMethod([degradation('search')]);
    const method = cache.memoize('search', optionsSchema, fn);

    await method({ id: 'a' });
    await expect(
      method({
        id: 'a',
        onDegradation: () => {
          throw new Error('consumer handler bug');
        },
      }),
    ).rejects.toThrow('consumer handler bug');

    expect(cache.size).toBe(1);
    await expect(method({ id: 'a' })).resolves.toBe('result:a');
    expect(callCount()).toBe(1);
  });
});
