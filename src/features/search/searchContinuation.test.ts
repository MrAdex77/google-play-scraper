import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBatchResponse } from '../../core/batchexecute.ts';
import { clusterItemSpecs } from '../../core/clusterItem.ts';
import { getPath } from '../../core/path.ts';
import { CLUSTER_PAGE_SIZE, CLUSTER_RPC_ID } from '../../core/pagination.ts';
import { extract } from '../../core/spec.ts';
import type { DegradationEvent } from '../../core/degradation.ts';
import { fetchSearchFirstPage, search } from './search.ts';
import { searchIterator } from './searchIterator.ts';
import { searchResultSchema, type SearchResult } from './schema.ts';
import { CLUSTER_MAPPINGS } from './specs.ts';
import { clusterBatchResponse } from '../../../test/helpers/clusterResponse.ts';

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/search/${name}`, import.meta.url)),
    'utf8',
  );

const firstPageHtml = readFixture('fl-studio-mobile.html');
const continuationText = readFixture('fl-studio-mobile-continuation.txt');

const QUERY = { term: 'FL Studio Mobile', lang: 'en', country: 'us', price: 'all' } as const;

const recordedFirstPage = async () => {
  const { page } = await fetchSearchFirstPage(QUERY, () => ({
    request: () => Promise.resolve(firstPageHtml),
  }));
  return page;
};

describe('recorded search continuation fixtures', () => {
  it('serves a continuation token on the recorded first page', async () => {
    const page = await recordedFirstPage();

    expect(page.apps.length).toBeGreaterThan(0);
    expect(typeof page.token).toBe('string');
    expect(page.token?.length).toBeGreaterThan(0);
  });

  it('records a continuation page of cluster items with a further token', () => {
    const payload = parseBatchResponse(continuationText, CLUSTER_RPC_ID);
    const apps = getPath(payload, CLUSTER_MAPPINGS.apps);

    expect(Array.isArray(apps)).toBe(true);
    expect(apps).toHaveLength(CLUSTER_PAGE_SIZE);
    expect(typeof getPath(payload, CLUSTER_MAPPINGS.token)).toBe('string');
  });

  it('extracts every recorded continuation item with the cluster item shape', () => {
    const payload = parseBatchResponse(continuationText, CLUSTER_RPC_ID);
    const apps = getPath(payload, CLUSTER_MAPPINGS.apps);
    if (!Array.isArray(apps)) {
      throw new Error('the recorded continuation carries no apps array');
    }

    const items = apps.map((item) => extract(item, clusterItemSpecs, 'search'));

    expect(items).toHaveLength(apps.length);
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.url.startsWith('https://play.google.com/store/apps/details?id=')).toBe(true);
    }
  });
});

interface RecordedFetch {
  fetchImpl: typeof fetch;
  bodies: string[];
}

const recordedFetch = (responses: string[]): RecordedFetch => {
  const bodies: string[] = [];
  let index = 0;
  const fetchImpl: typeof fetch = (_input, init) => {
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    const response = responses[Math.min(index, responses.length - 1)] ?? '';
    index += 1;
    return Promise.resolve(new Response(response, { status: 200 }));
  };
  return { fetchImpl, bodies };
};

const firstPageIds = async (): Promise<string[]> =>
  (await recordedFirstPage()).apps.map((item) => item.appId);

describe('search over a recorded continuation', () => {
  it('appends continuation items after the first page and honors num exactly', async () => {
    const firstIds = await firstPageIds();
    const num = firstIds.length + 10;
    const events: DegradationEvent[] = [];
    const { fetchImpl } = recordedFetch([firstPageHtml, continuationText]);

    const results = (await search({
      term: QUERY.term,
      num,
      onDegradation: (event) => events.push(event),
      requestOptions: { fetchImpl },
    })) as SearchResult[];

    const ids = results.map((item) => item.appId);
    expect(events).toEqual([]);
    expect(results).toHaveLength(num);
    expect(ids.slice(0, firstIds.length)).toEqual(firstIds);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of results.slice(firstIds.length)) {
      expect(() => searchResultSchema.parse(item)).not.toThrow();
    }
  });

  it('requests the continuation page with the token the first page served', async () => {
    const page = await recordedFirstPage();
    const { fetchImpl, bodies } = recordedFetch([firstPageHtml, continuationText]);

    await search({
      term: QUERY.term,
      num: page.apps.length + 1,
      requestOptions: { fetchImpl },
    });

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toContain(page.token);
  });

  it('makes no continuation request when the first page already satisfies num', async () => {
    const firstIds = await firstPageIds();
    const { fetchImpl, bodies } = recordedFetch([firstPageHtml, continuationText]);

    const results = (await search({
      term: QUERY.term,
      num: firstIds.length,
      requestOptions: { fetchImpl },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(firstIds);
    expect(bodies).toHaveLength(1);
  });

  it('streams the first page and every continuation item through the iterator', async () => {
    const firstIds = await firstPageIds();
    const { fetchImpl } = recordedFetch([
      firstPageHtml,
      continuationText,
      clusterBatchResponse([], null),
    ]);
    const events: DegradationEvent[] = [];

    const ids: string[] = [];
    for await (const item of searchIterator({
      term: QUERY.term,
      onDegradation: (event) => events.push(event),
      requestOptions: { fetchImpl },
    })) {
      ids.push(item.appId);
    }

    expect(events).toEqual([]);
    expect(ids).toHaveLength(firstIds.length + CLUSTER_PAGE_SIZE);
    expect(ids.slice(0, firstIds.length)).toEqual(firstIds);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
