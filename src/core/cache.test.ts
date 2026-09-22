import { describe, expect, it } from 'vitest';
import { createKeyBuilder } from './cache.js';

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

    expect(noisy).toBe(plain.replace('}', ',"requestOptions":{}}'));
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
