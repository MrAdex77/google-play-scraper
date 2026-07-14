import { describe, expect, it } from 'vitest';
import { reviewsAll } from './reviewsAll.js';
import { REVIEWS_RPC_ID } from './specs.js';
import { ValidationError } from '../../core/errors.js';

const TRANSLATE = 'com.google.android.apps.translate';

const sequenceFetch = (bodies: string[]): { fetchImpl: typeof fetch; count: () => number } => {
  let index = 0;
  const impl: typeof fetch = () => {
    const body = bodies[Math.min(index, bodies.length - 1)] ?? '';
    index += 1;
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl: impl, count: () => index };
};

const reviewEntry = (id: string): unknown[] => {
  const entry: unknown[] = [];
  entry[0] = id;
  entry[1] = [`User ${id}`, [null, null, null, [null, null, 'https://avatar.example/user.png']]];
  entry[2] = 5;
  entry[4] = `Review text ${id}`;
  entry[5] = [1700000000, 123456789];
  entry[6] = 12;
  entry[10] = '9.9.9';
  return entry;
};

const reviewsBatch = (ids: string[], token: string | null): string => {
  const payload = [ids.map((id) => reviewEntry(id)), [null, token]];
  const frame = [['wrb.fr', REVIEWS_RPC_ID, JSON.stringify(payload), null, null, null, 'generic']];
  const json = JSON.stringify(frame);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
};

describe('reviewsAll', () => {
  it('returns exactly maxReviews and stops fetching mid-page', async () => {
    const { fetchImpl, count } = sequenceFetch([
      reviewsBatch(['a', 'b', 'c'], 't2'),
      reviewsBatch(['d', 'e', 'f'], null),
    ]);

    const result = await reviewsAll({
      appId: TRANSLATE,
      maxReviews: 2,
      requestOptions: { fetchImpl },
    });

    expect(result.map((review) => review.id)).toEqual(['a', 'b']);
    expect(count()).toBe(1);
  });

  it('crosses pages when maxReviews exceeds the first page size', async () => {
    const { fetchImpl, count } = sequenceFetch([
      reviewsBatch(['a', 'b'], 't2'),
      reviewsBatch(['c', 'd'], null),
    ]);

    const result = await reviewsAll({
      appId: TRANSLATE,
      maxReviews: 3,
      requestOptions: { fetchImpl },
    });

    expect(result.map((review) => review.id)).toEqual(['a', 'b', 'c']);
    expect(count()).toBe(2);
  });

  it('drains the stream when no maxReviews is given', async () => {
    const { fetchImpl } = sequenceFetch([
      reviewsBatch(['a', 'b'], 't2'),
      reviewsBatch(['c'], null),
    ]);

    const result = await reviewsAll({ appId: TRANSLATE, requestOptions: { fetchImpl } });

    expect(result.map((review) => review.id)).toEqual(['a', 'b', 'c']);
  });

  it('rejects an invalid maxReviews through validation', async () => {
    await expect(reviewsAll({ appId: TRANSLATE, maxReviews: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
