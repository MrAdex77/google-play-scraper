import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createReviewsIterator, reviewsIterator } from './reviewsIterator.js';
import { reviews } from './reviews.js';
import { REVIEWS_RPC_ID } from './specs.js';
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

describe('reviewsIterator laziness', () => {
  it('performs zero fetches until the first consumption', () => {
    const { fetchImpl, count } = sequenceFetch([initial]);
    reviewsIterator({ appId: TRANSLATE, requestOptions: { fetchImpl } });
    expect(count()).toBe(0);
  });

  it('stops fetching the moment the consumer breaks after the first page', async () => {
    const { fetchImpl, count } = sequenceFetch([initial, page2]);

    const collected: string[] = [];
    for await (const review of reviewsIterator({
      appId: TRANSLATE,
      requestOptions: { fetchImpl },
    })) {
      collected.push(review.id);
      if (collected.length === 10) {
        break;
      }
    }

    expect(collected).toHaveLength(10);
    expect(count()).toBe(1);
  });

  it('stops fetching once the generator is returned early', async () => {
    const { fetchImpl, count } = sequenceFetch([initial, page2]);
    const iterator = reviewsIterator({ appId: TRANSLATE, requestOptions: { fetchImpl } });

    await iterator.next();
    await iterator.return();

    expect(count()).toBe(1);
  });
});

describe('reviewsIterator streaming', () => {
  it('crosses the page boundary and yields validated reviews in order', async () => {
    const { fetchImpl } = sequenceFetch([
      reviewsBatch(['a', 'b'], 't2'),
      reviewsBatch(['c', 'd'], null),
    ]);

    const streamed: string[] = [];
    for await (const review of reviewsIterator({
      appId: TRANSLATE,
      requestOptions: { fetchImpl },
    })) {
      expect(() => reviewSchema.parse(review)).not.toThrow();
      streamed.push(review.id);
    }

    const eager = await reviews({
      appId: TRANSLATE,
      num: 100,
      requestOptions: {
        fetchImpl: sequenceFetch([reviewsBatch(['a', 'b'], 't2'), reviewsBatch(['c', 'd'], null)])
          .fetchImpl,
      },
    });

    expect(streamed).toEqual(['a', 'b', 'c', 'd']);
    expect(streamed).toEqual(eager.data.map((review) => review.id));
  });

  it('resumes mid-stream from a provided pagination token', async () => {
    const providedToken = 'CtgBIs8BAU60USdRESUME';
    const { fetchImpl, bodies } = capturingFetch(reviewsBatch(['c'], null));

    const iterator = reviewsIterator({
      appId: TRANSLATE,
      nextPaginationToken: providedToken,
      requestOptions: { fetchImpl },
    });
    await iterator.next();

    expect(bodies[0]).toContain(providedToken);
  });
});

describe('reviewsIterator validation', () => {
  it('throws a ValidationError synchronously for an empty appId', () => {
    expect(() => reviewsIterator({ appId: '' })).toThrow(ValidationError);
  });

  it('routes through an injected resolveClient', async () => {
    const { fetchImpl } = sequenceFetch([reviewsBatch(['a'], null)]);
    const bound = createReviewsIterator(() => ({
      request: () => fetchImpl('', {}).then((response) => response.text()),
    }));

    const ids: string[] = [];
    for await (const review of bound({ appId: TRANSLATE })) {
      ids.push(review.id);
    }

    expect(ids).toEqual(['a']);
  });
});
