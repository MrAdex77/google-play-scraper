import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBatchResponse } from '../../core/batchexecute.ts';
import { clusterItemSpecs } from '../../core/clusterItem.ts';
import { getPath } from '../../core/path.ts';
import { CLUSTER_PAGE_SIZE, CLUSTER_RPC_ID } from '../../core/pagination.ts';
import { extract } from '../../core/spec.ts';
import { fetchSearchFirstPage } from './search.ts';
import { CLUSTER_MAPPINGS } from './specs.ts';

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/search/${name}`, import.meta.url)),
    'utf8',
  );

const firstPageHtml = readFixture('fl-studio-mobile.html');
const continuationText = readFixture('fl-studio-mobile-continuation.txt');

const QUERY = { term: 'FL Studio Mobile', lang: 'en', country: 'us', price: 'all' } as const;

describe('recorded search continuation fixtures', () => {
  it('serves a continuation token on the recorded first page', async () => {
    const { page } = await fetchSearchFirstPage(QUERY, () => ({
      request: () => Promise.resolve(firstPageHtml),
    }));

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
