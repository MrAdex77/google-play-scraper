import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSearch, search, type SearchOptions } from './search.js';
import { searchResultSchema, type SearchResult } from './schema.js';
import type { App } from '../app/schema.js';
import { ValidationError } from '../../core/errors.js';

const pandaHtml = readFileSync(
  fileURLToPath(new URL('../../../test/fixtures/search/panda.html', import.meta.url)),
  'utf8',
);

const fetchReturning = (body: string, status = 200): typeof fetch => {
  const impl: typeof fetch = () => Promise.resolve(new Response(body, { status }));
  return impl;
};

const recordingFetch = (body: string): { fetchImpl: typeof fetch; urls: string[] } => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl, urls };
};

const sequenceFetch = (bodies: string[]): typeof fetch => {
  let index = 0;
  const impl: typeof fetch = () => {
    const body = bodies[Math.min(index, bodies.length - 1)] ?? '';
    index += 1;
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return impl;
};

const buildScriptData = (key: string, value: unknown): string =>
  `<script>AF_initDataCallback({key: '${key}', hash: '1', data:${JSON.stringify(value)}, sideChannel: {}});</script>`;

const coreData = (id: string): unknown[] => {
  const core: unknown[] = [];
  core[0] = [id];
  core[1] = [null, null, null, [null, null, `https://icon.example/${id}`]];
  core[3] = `App ${id}`;
  core[4] = ['4.5', 4.5];
  core[8] = [null, [[0, 'USD']]];
  core[10] = [null, null, null, null, [null, null, `/store/apps/details?id=${id}`]];
  core[13] = [null, `Summary of ${id}`];
  core[14] = `Dev ${id}`;
  return core;
};

const searchPageHtml = (ids: string[], token: string): string => {
  const apps = ids.map((id) => [coreData(id)]);
  const section: unknown[] = [];
  section[22] = [apps, [null, null, null, [null, token]]];
  const ds4 = [[null, [section]]];
  return buildScriptData('ds:4', ds4);
};

const clusterBatch = (ids: string[], nextToken: string | null): string => {
  const apps = ids.map((id) => coreData(id));
  const inner: unknown[] = [];
  inner[0] = apps;
  inner[7] = [null, nextToken];
  const payload = [[inner]];
  const frame = [['wrb.fr', 'qnKhOb', JSON.stringify(payload), null, null, null, 'generic']];
  const json = JSON.stringify(frame);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
};

describe('search fixture parsing', () => {
  it('parses the recorded panda page into validated results', async () => {
    const results = (await search({
      term: 'panda',
      num: 30,
      requestOptions: { fetchImpl: fetchReturning(pandaHtml) },
    })) as SearchResult[];

    expect(results.length).toBeGreaterThanOrEqual(20);
    for (const item of results) {
      expect(() => searchResultSchema.parse(item)).not.toThrow();
      expect(item.url.startsWith('https://play.google.com')).toBe(true);
    }
    expect(new Set(results.map((item) => item.appId)).size).toBe(results.length);
    expect(results.some((item) => item.free && item.price === 0)).toBe(true);
  });

  it('prepends the exact match app as the first result', async () => {
    const results = (await search({
      term: 'panda',
      requestOptions: { fetchImpl: fetchReturning(pandaHtml) },
    })) as SearchResult[];

    expect(results[0]?.appId).toBe('com.pandaexpress.app');
    expect(results[0]?.title).toBe('Panda Express');
    expect(results.filter((item) => item.appId === 'com.pandaexpress.app')).toHaveLength(1);
  });
});

describe('search pagination', () => {
  it('merges cluster pages and respects num exactly', async () => {
    const firstPage = searchPageHtml(['a', 'b', 'c'], 'page-2-token');
    const secondPage = clusterBatch(['d', 'e', 'f'], null);

    const results = (await search({
      term: 'panda',
      num: 5,
      requestOptions: { fetchImpl: sequenceFetch([firstPage, secondPage]) },
    })) as SearchResult[];

    expect(results).toHaveLength(5);
    expect(results.map((item) => item.appId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns only the first page when it already satisfies num', async () => {
    const firstPage = searchPageHtml(['a', 'b', 'c'], 'page-2-token');

    const results = (await search({
      term: 'panda',
      num: 2,
      requestOptions: { fetchImpl: fetchReturning(firstPage) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['a', 'b']);
  });
});

describe('search options', () => {
  it('maps the price filter into the query string', async () => {
    const paid = recordingFetch(pandaHtml);
    await search({ term: 'panda', price: 'paid', requestOptions: { fetchImpl: paid.fetchImpl } });
    expect(paid.urls[0]).toContain('price=2');

    const free = recordingFetch(pandaHtml);
    await search({ term: 'panda', price: 'free', requestOptions: { fetchImpl: free.fetchImpl } });
    expect(free.urls[0]).toContain('price=1');
  });

  it('rejects a missing term through validation', async () => {
    await expect(search({} as SearchOptions)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a num above the maximum through validation', async () => {
    await expect(
      search({ term: 'panda', num: 251, requestOptions: { fetchImpl: fetchReturning(pandaHtml) } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('search fullDetail', () => {
  it('resolves each result through the injected getApp exactly once', async () => {
    const plain = (await search({
      term: 'panda',
      num: 3,
      requestOptions: { fetchImpl: fetchReturning(pandaHtml) },
    })) as SearchResult[];

    const requested: string[] = [];
    const stubbedApp = (appId: string): App => ({ appId, description: `detail ${appId}` }) as App;
    const searchWithStub = createSearch((params) => {
      requested.push(params.appId);
      return Promise.resolve(stubbedApp(params.appId));
    });

    const detailed = (await searchWithStub({
      term: 'panda',
      num: 3,
      fullDetail: true,
      requestOptions: { fetchImpl: fetchReturning(pandaHtml) },
    })) as App[];

    expect(requested).toEqual(plain.map((item) => item.appId));
    expect(detailed).toHaveLength(3);
    expect(detailed.every((item) => item.description.startsWith('detail '))).toBe(true);
  });
});
