import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { reviewPages, reviews, type ReviewPageQuery, type ReviewsOptions } from './reviews.js';
import { REVIEWS_RPC_ID } from './specs.js';
import { reviewSchema } from './schema.js';
import { createHttpClient } from '../../core/http.js';
import { sort } from '../../constants.js';
import { SpecError, ValidationError } from '../../core/errors.js';

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

  it('derives sub second milliseconds from a nanosecond field shorter than nine digits', async () => {
    const result = await reviews({
      appId: TRANSLATE,
      num: 150,
      requestOptions: { fetchImpl: fetchReturning(initial) },
    });

    const dates = result.data.map((review) => review.date);
    expect(dates).toContain('2026-07-06T13:55:24.077Z');
    expect(dates).not.toContain('2026-07-06T13:55:24.770Z');
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

const reviewsBatch = (entries: unknown, token: string | null): string => {
  const payload = [entries, [null, token]];
  const frame = [['wrb.fr', REVIEWS_RPC_ID, JSON.stringify(payload), null, null, null, 'generic']];
  const json = JSON.stringify(frame);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
};

describe('reviews degraded payloads', () => {
  it('stops accumulating when the server repeats a pagination token', async () => {
    const { fetchImpl, count } = sequenceFetch([
      reviewsBatch([reviewEntry('r1'), reviewEntry('r2')], 'repeated-token'),
      reviewsBatch([reviewEntry('r3')], 'repeated-token'),
    ]);

    const result = await reviews({
      appId: TRANSLATE,
      num: 100,
      requestOptions: { fetchImpl },
    });

    expect(count()).toBe(2);
    expect(result.data.map((review) => review.id)).toEqual(['r1', 'r2', 'r3']);
    expect(result.nextPaginationToken).toBeNull();
  });

  it('treats an empty token as the final page', async () => {
    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl: fetchReturning(reviewsBatch([reviewEntry('r1')], '')) },
    });

    expect(result.data).toHaveLength(1);
    expect(result.nextPaginationToken).toBeNull();
  });

  it('maps criteria entries and empty replies through their fallbacks', async () => {
    const entry = reviewEntry('r1');
    entry[7] = [null, '', [1700000100, 0]];
    entry[12] = [
      [
        ['speed', [4]],
        ['design', []],
        ['comfort', 'not-a-holder'],
      ],
    ];

    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl: fetchReturning(reviewsBatch([entry], null)) },
    });

    const review = result.data[0];
    expect(review?.criterias).toEqual([
      { criteria: 'speed', rating: 4 },
      { criteria: 'design', rating: null },
      { criteria: 'comfort', rating: null },
    ]);
    expect(review?.replyText).toBeUndefined();
    expect(review?.replyDate).toBeDefined();
    expect(review?.userImage).toBe('https://avatar.example/user.png');
    expect(review?.version).toBe('9.9.9');
  });

  it('strips control characters from review text and reply text', async () => {
    const entry = reviewEntry('r1');
    entry[4] = 'Great\u0000 app\u0007 loved it';
    entry[7] = [null, 'Thank\u0000 you', [1700000100, 0]];

    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl: fetchReturning(reviewsBatch([entry], null)) },
    });

    expect(result.data[0]?.text).toBe('Great app loved it');
    expect(result.data[0]?.replyText).toBe('Thank you');
  });

  it('returns an empty page when the reviews block is missing', async () => {
    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl: fetchReturning(reviewsBatch(null, null)) },
    });

    expect(result.data).toEqual([]);
    expect(result.nextPaginationToken).toBeNull();
  });

  it('drops a reply date that does not resolve to a valid time', async () => {
    const entry = reviewEntry('r1');
    entry[7] = [null, 'thanks', ['garbage-seconds', 0]];

    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl: fetchReturning(reviewsBatch([entry], null)) },
    });

    expect(result.data[0]?.replyDate).toBeUndefined();
    expect(result.data[0]?.replyText).toBe('thanks');
  });

  it('drops a reply date with fractional seconds or out of range nanoseconds', async () => {
    const fractional = reviewEntry('r1');
    fractional[7] = [null, 'thanks', [77.5, 0]];
    const overflow = reviewEntry('r2');
    overflow[7] = [null, 'thanks', [1700000100, 1000000000]];

    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl: fetchReturning(reviewsBatch([fractional, overflow], null)) },
    });

    expect(result.data[0]?.replyDate).toBeUndefined();
    expect(result.data[1]?.replyDate).toBeUndefined();
  });

  it('keeps a reply date at the nanosecond upper bound', async () => {
    const entry = reviewEntry('r1');
    entry[7] = [null, 'thanks', [1700000100, 999999999]];

    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl: fetchReturning(reviewsBatch([entry], null)) },
    });

    expect(result.data[0]?.replyDate).toBe('2023-11-14T22:15:00.999Z');
  });

  it('surfaces a SpecError when a criteria entry is not an array', async () => {
    const entry = reviewEntry('r1');
    entry[12] = [['bogus-criteria']];

    let thrown: unknown;
    try {
      await reviews({
        appId: TRANSLATE,
        paginate: true,
        requestOptions: { fetchImpl: fetchReturning(reviewsBatch([entry], null)) },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SpecError);
    const failedFields = (thrown as SpecError).failures.map((failure) => failure.field);
    expect(failedFields).toContain('criterias');
  });
});

const pageQuery = (overrides: Partial<ReviewPageQuery> = {}): ReviewPageQuery => ({
  appId: TRANSLATE,
  sort: sort.NEWEST,
  lang: 'en',
  country: 'us',
  nextPaginationToken: undefined,
  ...overrides,
});

describe('reviewPages generator', () => {
  it('yields one page per fetch until the token runs out', async () => {
    const { fetchImpl, count } = sequenceFetch([
      reviewsBatch([reviewEntry('r1')], 'token-2'),
      reviewsBatch([reviewEntry('r2')], null),
    ]);
    const client = createHttpClient({ fetchImpl });

    const ids: string[][] = [];
    for await (const page of reviewPages(client, pageQuery())) {
      ids.push(page.reviews.map((review) => review.id));
    }

    expect(ids).toEqual([['r1'], ['r2']]);
    expect(count()).toBe(2);
  });

  it('stops after the repeated token page without a further fetch', async () => {
    const { fetchImpl, count } = sequenceFetch([
      reviewsBatch([reviewEntry('r1')], 'loop'),
      reviewsBatch([reviewEntry('r2')], 'loop'),
    ]);
    const client = createHttpClient({ fetchImpl });

    const ids: string[] = [];
    for await (const page of reviewPages(client, pageQuery())) {
      for (const review of page.reviews) {
        ids.push(review.id);
      }
    }

    expect(ids).toEqual(['r1', 'r2']);
    expect(count()).toBe(2);
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
