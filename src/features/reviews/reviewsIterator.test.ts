import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createReviewsIterator, reviewsIterator } from './reviewsIterator.ts';
import { reviews } from './reviews.ts';
import { REVIEWS_RPC_ID } from './specs.ts';
import { reviewSchema } from './schema.ts';
import { MALFORMED_APP_IDS } from '../../../test/helpers/appIds.ts';
import { ValidationError } from '../../core/errors.ts';
import type { IntegrityEvent } from '../../core/integrity.ts';

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

  it('throws synchronously for every malformed appId without any request', () => {
    const fetchImpl = vi.fn<typeof fetch>();

    for (const appId of MALFORMED_APP_IDS) {
      expect(() => reviewsIterator({ appId, requestOptions: { fetchImpl } })).toThrow(
        /^reviewsIterator: appId: must be/,
      );
    }

    expect(fetchImpl).not.toHaveBeenCalled();
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

const recordingFetch = (responses: string[]): { fetchImpl: typeof fetch; bodies: string[] } => {
  const bodies: string[] = [];
  const impl: typeof fetch = (_input, init) => {
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    const body = responses[Math.min(bodies.length - 1, responses.length - 1)] ?? '';
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl: impl, bodies };
};

describe('reviewsIterator request sizing', () => {
  it('requests the default page size when no pageSize is given', async () => {
    const { fetchImpl, bodies } = recordingFetch([reviewsBatch(['a'], null)]);

    for await (const review of reviewsIterator({
      appId: TRANSLATE,
      requestOptions: { fetchImpl },
    })) {
      expect(review.id).toBe('a');
    }

    expect(bodies[0]).toContain('%5B150%2Cnull%2Cnull%5D');
  });

  it('uses the configured pageSize on every request', async () => {
    const { fetchImpl, bodies } = recordingFetch([
      reviewsBatch(['a', 'b'], 't2'),
      reviewsBatch(['c', 'd'], null),
    ]);

    const ids: string[] = [];
    for await (const review of reviewsIterator({
      appId: TRANSLATE,
      pageSize: 2,
      requestOptions: { fetchImpl },
    })) {
      ids.push(review.id);
    }

    expect(ids).toEqual(['a', 'b', 'c', 'd']);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain('%5B2%2Cnull%2Cnull%5D');
    expect(bodies[1]).toContain('%5B2%2Cnull%2C%5C%22t2%5C%22%5D');
  });

  it('issues no further request when the consumer stops inside a small page', async () => {
    const { fetchImpl, bodies } = recordingFetch([
      reviewsBatch(['a', 'b', 'c'], 't2'),
      reviewsBatch(['d'], null),
    ]);

    for await (const review of reviewsIterator({
      appId: TRANSLATE,
      pageSize: 3,
      requestOptions: { fetchImpl },
    })) {
      if (review.id === 'a') {
        break;
      }
    }

    expect(bodies).toHaveLength(1);
  });

  it('never applies a request budget to an open-ended stream of short pages', async () => {
    const pageIds = ['a', 'b', 'c', 'd', 'e', 'f'];
    const { fetchImpl, bodies } = recordingFetch(
      pageIds.map((id, index) =>
        reviewsBatch([id], index === pageIds.length - 1 ? null : `t${id}`),
      ),
    );
    const events: IntegrityEvent[] = [];

    const ids: string[] = [];
    for await (const review of reviewsIterator({
      appId: TRANSLATE,
      pageSize: 5,
      onIntegrityEvent: (event) => events.push(event),
      requestOptions: { fetchImpl },
    })) {
      ids.push(review.id);
    }

    expect(ids).toEqual(pageIds);
    expect(bodies).toHaveLength(pageIds.length);
    expect(events).toEqual([]);
  });
});

describe('reviewsIterator filters', () => {
  it('forwards the score and device filters on every request', async () => {
    const { fetchImpl, bodies } = recordingFetch([
      reviewsBatch(['a'], 't2'),
      reviewsBatch(['b'], null),
    ]);

    const ids: string[] = [];
    for await (const review of reviewsIterator({
      appId: TRANSLATE,
      score: 4,
      device: 'chromebook',
      requestOptions: { fetchImpl },
    })) {
      ids.push(review.id);
    }

    expect(ids).toEqual(['a', 'b']);
    for (const body of bodies) {
      expect(body).toContain('%5Bnull%2C4%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2C5%5D');
    }
  });

  it('rejects an unknown device synchronously', () => {
    expect(() =>
      reviewsIterator({ appId: TRANSLATE, device: 'phone' } as unknown as Parameters<
        typeof reviewsIterator
      >[0]),
    ).toThrow(ValidationError);
  });
});
