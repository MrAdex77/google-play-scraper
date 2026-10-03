import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { reviewPages, reviews, type ReviewPageQuery, type ReviewsOptions } from './reviews.ts';
import { REVIEWS_RPC_ID } from './specs.ts';
import { reviewSchema } from './schema.ts';
import { createHttpClient } from '../../core/http.ts';
import { sort } from '../../constants.ts';
import { ParseError, SpecError, ValidationError } from '../../core/errors.ts';
import type { IntegrityEvent } from '../../core/integrity.ts';

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

const reviewsPayloadBatch = (payload: unknown): string => {
  const frame = [['wrb.fr', REVIEWS_RPC_ID, JSON.stringify(payload), null, null, null, 'generic']];
  const json = JSON.stringify(frame);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
};

const reviewsBatch = (entries: unknown, token: string | null): string =>
  reviewsPayloadBatch([entries, [null, token]]);

describe('reviews degraded payloads', () => {
  it('stops accumulating when the server repeats a pagination token', async () => {
    const { fetchImpl, count } = sequenceFetch([
      reviewsBatch([reviewEntry('r1'), reviewEntry('r2')], 'repeated-token'),
      reviewsBatch([reviewEntry('r3')], 'repeated-token'),
    ]);

    const events: IntegrityEvent[] = [];
    const result = await reviews({
      appId: TRANSLATE,
      num: 100,
      onIntegrityEvent: (event) => events.push(event),
      requestOptions: { fetchImpl },
    });

    expect(count()).toBe(2);
    expect(result.data.map((review) => review.id)).toEqual(['r1', 'r2', 'r3']);
    expect(result.nextPaginationToken).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]?.context).toBe('reviews');
    expect(events[0]?.reason).toBe('pagination-token-cycle');
    expect(events[0]?.error).toBeInstanceOf(ParseError);
    expect(events[0]?.error.message).not.toContain('repeated-token');
  });

  it('lets a throwing review token cycle callback surface to the consumer', async () => {
    const { fetchImpl } = sequenceFetch([
      reviewsBatch([reviewEntry('r1')], 'repeated-token'),
      reviewsBatch([reviewEntry('r2')], 'repeated-token'),
    ]);

    await expect(
      reviews({
        appId: TRANSLATE,
        num: 100,
        onIntegrityEvent: () => {
          throw new Error('consumer handler bug');
        },
        requestOptions: { fetchImpl },
      }),
    ).rejects.toThrow('consumer handler bug');
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

  it('treats an omitted token holder as the final page', async () => {
    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl: fetchReturning(reviewsPayloadBatch([[reviewEntry('r1')]])) },
    });

    expect(result.data).toHaveLength(1);
    expect(result.nextPaginationToken).toBeNull();
  });

  it('keeps a legacy review without a star rating as score zero', async () => {
    const unrated = reviewEntry('legacy');
    unrated[2] = 0;
    unrated[5] = [1362564316, 637000000];

    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: {
        fetchImpl: fetchReturning(reviewsBatch([reviewEntry('r1'), unrated], null)),
      },
    });

    expect(result.data.map((review) => review.score)).toEqual([5, 0]);
    expect(result.data[1]?.date).toBe('2013-03-06T10:05:16.637Z');
  });

  it.each([-1, 6])('rejects a review score of %d outside the zero to five range', async (score) => {
    const outOfRange = reviewEntry('broken');
    outOfRange[2] = score;

    await expect(
      reviews({
        appId: TRANSLATE,
        paginate: true,
        requestOptions: { fetchImpl: fetchReturning(reviewsBatch([outOfRange], null)) },
      }),
    ).rejects.toThrow('score');
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

  it('maps a present non-array criteria collection to an empty list', async () => {
    const entry = reviewEntry('r1');
    entry[12] = ['invalid-criteria-collection'];

    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl: fetchReturning(reviewsBatch([entry], null)) },
    });

    expect(result.data[0]?.criterias).toEqual([]);
  });

  it('rejects a present non-array criteria entry', async () => {
    const entry = reviewEntry('r1');
    entry[12] = [[42]];

    await expect(
      reviews({
        appId: TRANSLATE,
        paginate: true,
        requestOptions: { fetchImpl: fetchReturning(reviewsBatch([entry], null)) },
      }),
    ).rejects.toBeInstanceOf(SpecError);
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

  it('returns an empty page for the recorded missing-app payload', async () => {
    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl: fetchReturning(reviewsPayloadBatch([])) },
    });

    expect(result.data).toEqual([]);
    expect(result.nextPaginationToken).toBeNull();
  });

  it('ends pagination when the token holder is null', async () => {
    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: {
        fetchImpl: fetchReturning(reviewsPayloadBatch([[reviewEntry('r1')], null])),
      },
    });

    expect(result.data.map((review) => review.id)).toEqual(['r1']);
    expect(result.nextPaginationToken).toBeNull();
  });

  it('rejects a response whose reviews block is not an array or null', async () => {
    await expect(
      reviews({
        appId: TRANSLATE,
        paginate: true,
        requestOptions: { fetchImpl: fetchReturning(reviewsBatch('invalid', null)) },
      }),
    ).rejects.toBeInstanceOf(ParseError);
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

  it('defaults omitted date nanoseconds to zero', async () => {
    const entry = reviewEntry('r1');
    entry[5] = [1700000000];

    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      requestOptions: { fetchImpl: fetchReturning(reviewsBatch([entry], null)) },
    });

    expect(result.data[0]?.date).toBe('2023-11-14T22:13:20.000Z');
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

const recordingFetch = (responses: string[]): { fetchImpl: typeof fetch; bodies: string[] } => {
  const bodies: string[] = [];
  const impl: typeof fetch = (_input, init) => {
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    const body = responses[Math.min(bodies.length - 1, responses.length - 1)] ?? '';
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl: impl, bodies };
};

const entries = (prefix: string, count: number): unknown[] =>
  Array.from({ length: count }, (_, index) => reviewEntry(`${prefix}${index.toString()}`));

const countSlot = (count: number): string => `%5B${count.toString()}%2Cnull%2C`;
const EMPTY_FILTER = '%2Cnull%2C%5B%5D%5D%2C%5B%5C%22';

describe('reviews request sizing', () => {
  it('requests exactly num reviews in one request when num fits a page', async () => {
    const { fetchImpl, bodies } = recordingFetch([reviewsBatch(entries('r', 10), 'next')]);

    const result = await reviews({ appId: TRANSLATE, num: 10, requestOptions: { fetchImpl } });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain(countSlot(10));
    expect(bodies[0]).toContain(EMPTY_FILTER);
    expect(result.data).toHaveLength(10);
  });

  it('caps every request at the maximum page size and sizes the last one to the remainder', async () => {
    const { fetchImpl, bodies } = recordingFetch([
      reviewsBatch(entries('a', 4500), 'page-two'),
      reviewsBatch(entries('b', 500), 'page-three'),
    ]);

    const result = await reviews({ appId: TRANSLATE, num: 5000, requestOptions: { fetchImpl } });

    expect(bodies.map((body) => body.includes(countSlot(4500)))).toEqual([true, false]);
    expect(bodies[1]).toContain(countSlot(500));
    expect(bodies[1]).toContain('page-two');
    expect(result.data).toHaveLength(5000);
    expect(result.nextPaginationToken).toBeNull();
  });

  it('sizes continuation requests to the remaining count under an explicit pageSize', async () => {
    const { fetchImpl, bodies } = recordingFetch([
      reviewsBatch(entries('a', 3), 't2'),
      reviewsBatch(entries('b', 3), 't3'),
      reviewsBatch(entries('c', 1), 't4'),
    ]);

    const result = await reviews({
      appId: TRANSLATE,
      num: 7,
      pageSize: 3,
      requestOptions: { fetchImpl },
    });

    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toContain(countSlot(3));
    expect(bodies[1]).toContain(countSlot(3));
    expect(bodies[2]).toContain(countSlot(1));
    expect(result.data).toHaveLength(7);
  });

  it('slices to num when a page carries more reviews than requested', async () => {
    const { fetchImpl } = recordingFetch([reviewsBatch(entries('a', 5), null)]);

    const result = await reviews({ appId: TRANSLATE, num: 3, requestOptions: { fetchImpl } });

    expect(result.data).toHaveLength(3);
  });

  it('defaults a manual page to 150 reviews and honours an explicit pageSize', async () => {
    const defaulted = recordingFetch([reviewsBatch(entries('a', 1), null)]);
    await reviews({ appId: TRANSLATE, paginate: true, requestOptions: defaulted });
    expect(defaulted.bodies[0]).toContain(countSlot(150));

    const explicit = recordingFetch([reviewsBatch(entries('a', 1), null)]);
    await reviews({
      appId: TRANSLATE,
      paginate: true,
      pageSize: 20,
      requestOptions: explicit,
    });
    expect(explicit.bodies[0]).toContain(countSlot(20));
  });

  it('keeps sending pageSize on a manual page that resumes from a token', async () => {
    const { fetchImpl, bodies } = recordingFetch([reviewsBatch(entries('a', 1), null)]);

    await reviews({
      appId: TRANSLATE,
      paginate: true,
      pageSize: 25,
      nextPaginationToken: 'resume-me',
      requestOptions: { fetchImpl },
    });

    expect(bodies[0]).toContain(`${countSlot(25)}%5C%22resume-me%5C%22%5D`);
  });

  it.each([0, 4501, 1.5, '10'])('rejects pageSize %j through validation', async (pageSize) => {
    await expect(
      reviews({ appId: TRANSLATE, pageSize } as unknown as ReviewsOptions),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

const filteredInitial = readFixture('translate-score5-size10-initial.txt');
const filteredPage2 = readFixture('translate-score5-size10-page2.txt');
const SCORE_THREE_FILTER =
  '%5Bnull%2C3%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%5D%5D%2C%5B%5C%22';

describe('reviews score filter', () => {
  it('decodes the recorded score-filtered page into ten five star reviews with a token', async () => {
    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      pageSize: 10,
      score: 5,
      requestOptions: { fetchImpl: fetchReturning(filteredInitial) },
    });

    expect(result.data).toHaveLength(10);
    expect(result.data.every((review) => review.score === 5)).toBe(true);
    expect(typeof result.nextPaginationToken).toBe('string');
  });

  it('accumulates the recorded filtered pages into twenty distinct five star reviews', async () => {
    const { fetchImpl, bodies } = recordingFetch([filteredInitial, filteredPage2]);

    const result = await reviews({
      appId: TRANSLATE,
      num: 20,
      pageSize: 10,
      score: 5,
      requestOptions: { fetchImpl },
    });

    expect(bodies).toHaveLength(2);
    expect(result.data).toHaveLength(20);
    expect(new Set(result.data.map((review) => review.id)).size).toBe(20);
    expect(result.data.every((review) => review.score === 5)).toBe(true);
  });

  it('keeps the score filter on every continuation request', async () => {
    const { fetchImpl, bodies } = recordingFetch([
      reviewsBatch(entries('a', 10), 'page-two'),
      reviewsBatch(entries('b', 10), null),
    ]);

    await reviews({
      appId: TRANSLATE,
      num: 20,
      pageSize: 10,
      score: 3,
      requestOptions: { fetchImpl },
    });

    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain(SCORE_THREE_FILTER);
    expect(bodies[1]).toContain(SCORE_THREE_FILTER);
    expect(bodies[1]).toContain('page-two');
  });

  it('applies the supplied score next to an explicit token', async () => {
    const { fetchImpl, bodies } = recordingFetch([reviewsBatch(entries('a', 1), null)]);

    await reviews({
      appId: TRANSLATE,
      paginate: true,
      nextPaginationToken: 'minted-elsewhere',
      score: 3,
      requestOptions: { fetchImpl },
    });

    expect(bodies[0]).toContain('%5C%22minted-elsewhere%5C%22');
    expect(bodies[0]).toContain(SCORE_THREE_FILTER);
  });

  it.each([0, 6, 2.5, '5'])('rejects score %j through validation', async (score) => {
    await expect(
      reviews({ appId: TRANSLATE, score } as unknown as ReviewsOptions),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

const tabletInitial = readFixture('translate-tablet-size10.txt');
const TABLET_FILTER =
  '%5Bnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2C3%5D%5D%2C%5B%5C%22';
const WATCH_FILTER =
  '%5Bnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2C4%5D%5D%2C%5B%5C%22';
const SCORE_ONE_TABLET_FILTER =
  '%5Bnull%2C1%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2C3%5D%5D%2C%5B%5C%22';

describe('reviews device filter', () => {
  it('decodes the recorded tablet page and validates every review', async () => {
    const result = await reviews({
      appId: TRANSLATE,
      paginate: true,
      pageSize: 10,
      device: 'tablet',
      requestOptions: { fetchImpl: fetchReturning(tabletInitial) },
    });

    expect(result.data).toHaveLength(10);
    for (const review of result.data) {
      expect(() => reviewSchema.parse(review)).not.toThrow();
    }
  });

  it('sends a device filter alone and combined with a score across pages', async () => {
    const alone = recordingFetch([reviewsBatch(entries('a', 1), null)]);
    await reviews({ appId: TRANSLATE, num: 1, device: 'tablet', requestOptions: alone });
    expect(alone.bodies[0]).toContain(TABLET_FILTER);

    const combined = recordingFetch([
      reviewsBatch(entries('a', 1), 'page-two'),
      reviewsBatch(entries('b', 1), null),
    ]);
    await reviews({
      appId: TRANSLATE,
      num: 2,
      pageSize: 1,
      score: 1,
      device: 'tablet',
      requestOptions: combined,
    });
    expect(combined.bodies).toHaveLength(2);
    expect(combined.bodies[0]).toContain(SCORE_ONE_TABLET_FILTER);
    expect(combined.bodies[1]).toContain(SCORE_ONE_TABLET_FILTER);
  });

  it('keeps the watch filter on every continuation request', async () => {
    const watch = recordingFetch([
      reviewsBatch(entries('a', 1), 'page-two'),
      reviewsBatch(entries('b', 1), null),
    ]);
    const result = await reviews({
      appId: TRANSLATE,
      num: 2,
      pageSize: 1,
      device: 'watch',
      requestOptions: watch,
    });

    expect(result.data).toHaveLength(2);
    expect(watch.bodies).toHaveLength(2);
    expect(watch.bodies[0]).toContain(WATCH_FILTER);
    expect(watch.bodies[1]).toContain(WATCH_FILTER);
  });

  it('rejects an unknown device before any request', async () => {
    const { fetchImpl, bodies } = recordingFetch([reviewsBatch(entries('a', 1), null)]);

    await expect(
      reviews({
        appId: TRANSLATE,
        device: 'phone',
        requestOptions: { fetchImpl },
      } as unknown as ReviewsOptions),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(bodies).toHaveLength(0);
  });
});

describe('reviews request budget', () => {
  it('stops after twice the ideal request count and reports the exhausted budget', async () => {
    const { fetchImpl, bodies } = recordingFetch([
      reviewsBatch(entries('a', 3), 'secret-token-one'),
      reviewsBatch(entries('b', 3), 'secret-token-two'),
      reviewsBatch(entries('c', 3), 'secret-token-three'),
    ]);
    const events: IntegrityEvent[] = [];

    const result = await reviews({
      appId: TRANSLATE,
      num: 10,
      pageSize: 10,
      score: 2,
      onIntegrityEvent: (event) => events.push(event),
      requestOptions: { fetchImpl },
    });

    expect(bodies).toHaveLength(2);
    expect(result.data).toHaveLength(6);
    expect(result.nextPaginationToken).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]?.context).toBe('reviews');
    expect(events[0]?.reason).toBe('request-budget-exhausted');
    expect(events[0]?.error).toBeInstanceOf(ParseError);
    expect(events[0]?.error.message).toContain('budget of 2');
    expect(events[0]?.error.message).toContain('after collecting 6 of 10 requested reviews');
    expect(events[0]?.error.message).not.toContain('secret-token');
  });

  it('keeps paging through an empty filtered page that carries a token', async () => {
    const { fetchImpl, bodies } = recordingFetch([
      reviewsBatch([], 't2'),
      reviewsBatch(entries('a', 2), 't3'),
      reviewsBatch([], 't4'),
      reviewsBatch(entries('b', 2), 't5'),
    ]);
    const events: IntegrityEvent[] = [];

    const result = await reviews({
      appId: TRANSLATE,
      num: 4,
      pageSize: 2,
      score: 1,
      onIntegrityEvent: (event) => events.push(event),
      requestOptions: { fetchImpl },
    });

    expect(bodies).toHaveLength(4);
    expect(result.data.map((review) => review.id)).toEqual(['a0', 'a1', 'b0', 'b1']);
    expect(events).toEqual([]);
  });

  it('lets a throwing budget callback surface to the consumer', async () => {
    const { fetchImpl } = recordingFetch([
      reviewsBatch(entries('a', 1), 't2'),
      reviewsBatch(entries('b', 1), 't3'),
    ]);

    await expect(
      reviews({
        appId: TRANSLATE,
        num: 5,
        pageSize: 5,
        onIntegrityEvent: () => {
          throw new Error('budget handler bug');
        },
        requestOptions: { fetchImpl },
      }),
    ).rejects.toThrow('budget handler bug');
  });
});
