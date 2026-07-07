import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { reviews, type ReviewsOptions } from './reviews.js';
import { reviewSchema } from './schema.js';
import { ValidationError } from '../../core/errors.js';

const TRANSLATE = 'com.google.android.apps.translate';

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/reviews/${name}`, import.meta.url)),
    'utf8',
  );

const initial = readFixture('translate-initial.txt');
const page2 = readFixture('translate-page2.txt');

const fetchReturning =
  (body: string): typeof fetch =>
  () =>
    Promise.resolve(new Response(body, { status: 200 }));

const sequenceFetch = (bodies: string[]): { fetchImpl: typeof fetch; count: () => number } => {
  let index = 0;
  const impl: typeof fetch = () => {
    const body = bodies[Math.min(index, bodies.length - 1)] ?? '';
    index += 1;
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl: impl, count: () => index };
};

const capturingFetch = (body: string): { fetchImpl: typeof fetch; bodies: string[] } => {
  const bodies: string[] = [];
  const impl: typeof fetch = (_input, init) => {
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl: impl, bodies };
};

describe('reviews fixture parsing', () => {
  it('decodes the initial fixture into 150 valid reviews', async () => {
    const result = await reviews({
      appId: TRANSLATE,
      num: 150,
      requestOptions: { fetchImpl: fetchReturning(initial) },
    });

    expect(result.data).toHaveLength(150);
    expect(result.nextPaginationToken).toBeNull();

    for (const review of result.data) {
      expect(() => reviewSchema.parse(review)).not.toThrow();
      expect(review.score).toBeGreaterThanOrEqual(1);
      expect(review.score).toBeLessThanOrEqual(5);
      expect(Number.isNaN(Date.parse(review.date))).toBe(false);
    }
  });

  it('accumulates across both pages and slices to the requested num', async () => {
    const { fetchImpl, count } = sequenceFetch([initial, page2]);

    const result = await reviews({
      appId: TRANSLATE,
      num: 200,
      requestOptions: { fetchImpl },
    });

    expect(count()).toBe(2);
    expect(result.data).toHaveLength(200);
    expect(result.nextPaginationToken).toBeNull();
    expect(new Set(result.data.map((review) => review.id)).size).toBe(200);
  });
});

describe('reviews manual pagination', () => {
  it('performs a single fetch and returns the next token', async () => {
    const { fetchImpl, count } = sequenceFetch([initial]);

    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl },
    });

    expect(count()).toBe(1);
    expect(result.data).toHaveLength(150);
    expect(result.nextPaginationToken).not.toBeNull();
    expect(typeof result.nextPaginationToken).toBe('string');
  });

  it('sends the paginated body template when a token is provided', async () => {
    const providedToken = 'CtgBIs8BAU60USdTESTTOKEN';
    const { fetchImpl, bodies } = capturingFetch(page2);

    await reviews({
      appId: TRANSLATE,
      paginate: true,
      nextPaginationToken: providedToken,
      requestOptions: { fetchImpl },
    });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain(providedToken);
  });
});

describe('reviews options', () => {
  it('rejects an invalid sort value', async () => {
    await expect(
      reviews({ appId: TRANSLATE, sort: 5 } as unknown as ReviewsOptions),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a missing appId', async () => {
    await expect(reviews({} as ReviewsOptions)).rejects.toBeInstanceOf(ValidationError);
  });
});
