import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSearch, search, type SearchOptions } from './search.js';
import { filterByPrice, matchesPriceFilter } from './specs.js';
import { searchResultSchema, type SearchResult } from './schema.js';
import type { App } from '../app/schema.js';
import type { DegradationEvent } from '../../core/degradation.js';
import { ParseError, ValidationError } from '../../core/errors.js';

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/search/${name}`, import.meta.url)),
    'utf8',
  );

const pandaHtml = readFixture('panda.html');
const whereAmIHtml = readFixture('where-am-i.html');

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

const clusterBatchOf = (apps: unknown[], nextToken: string | null): string => {
  const inner: unknown[] = [];
  inner[0] = apps;
  inner[7] = [null, nextToken];
  const payload = [[inner]];
  const frame = [['wrb.fr', 'qnKhOb', JSON.stringify(payload), null, null, null, 'generic']];
  const json = JSON.stringify(frame);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
};

const clusterBatch = (ids: string[], nextToken: string | null): string =>
  clusterBatchOf(
    ids.map((id) => coreData(id)),
    nextToken,
  );

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
      expect(new URL(item.url).origin).toBe('https://play.google.com');
    }
    expect(new Set(results.map((item) => item.appId)).size).toBe(results.length);
    expect(results.some((item) => item.free && item.price === 0)).toBe(true);
  });

  it('finds the Where Am I game among the where am i results', async () => {
    const results = (await search({
      term: 'where am i',
      num: 30,
      requestOptions: { fetchImpl: fetchReturning(whereAmIHtml) },
    })) as SearchResult[];

    const game = results.find((item) => item.appId === 'com.adex77.WhereAmI');
    expect(game).toBeDefined();
    expect(game?.title).toBe('Where Am I? - GeoGuess Game');
    expect(game?.developer).toBe('Adex77');
    expect(game?.free).toBe(true);
    expect(game?.url).toBe('https://play.google.com/store/apps/details?id=com.adex77.WhereAmI');
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

  it('reports a degradation event and keeps the first page when the continuation is malformed', async () => {
    const firstPage = searchPageHtml(['a', 'b', 'c'], 'page-2-token');
    const malformedPage = clusterBatchOf([[42]], null);
    const events: DegradationEvent[] = [];

    const results = (await search({
      term: 'panda',
      num: 5,
      onDegradation: (event) => events.push(event),
      requestOptions: { fetchImpl: sequenceFetch([firstPage, malformedPage]) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['a', 'b', 'c']);
    expect(events).toHaveLength(1);
    expect(events[0]?.context).toBe('search');
    expect(events[0]?.reason).toBe('cluster-page-parse');
    expect(events[0]?.error).toBeInstanceOf(ParseError);
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

const exactMatchNode = (id: string): unknown[] => {
  const detail: unknown[] = [];
  detail[0] = [`App ${id}`];
  detail[68] = [
    `Dev ${id}`,
    [null, null, null, null, [null, null, `/store/apps/dev?id=${id}-dev`]],
  ];
  detail[73] = [[null, `Summary of ${id}`]];
  detail[95] = [[null, null, null, [null, null, `https://icon.example/${id}`]]];
  const node16: unknown[] = [];
  node16[2] = detail;
  node16[3] = { '12': [[id]] };
  const node17: unknown[] = [
    [[null, null, null, null, [null, null, `/store/apps/details?id=${id}`]]],
  ];
  const root: unknown[] = [];
  root[16] = node16;
  root[17] = node17;
  return root;
};

const searchPageWithSection = (section: unknown[]): string =>
  buildScriptData('ds:4', [[null, [section]]]);

const sectionWithApps = (ids: string[]): unknown[] => {
  const section: unknown[] = [];
  section[22] = [ids.map((id) => [coreData(id)])];
  return section;
};

describe('search malformed pages', () => {
  it('returns no results when the sections block is not an array', async () => {
    const html = buildScriptData('ds:4', [[null, 'not-sections']]);

    const results = (await search({
      term: 'panda',
      requestOptions: { fetchImpl: fetchReturning(html) },
    })) as SearchResult[];

    expect(results).toEqual([]);
  });

  it('returns no results when no section carries apps', async () => {
    const emptySection: unknown[] = [];
    emptySection[22] = [[]];

    const results = (await search({
      term: 'panda',
      requestOptions: { fetchImpl: fetchReturning(searchPageWithSection(emptySection)) },
    })) as SearchResult[];

    expect(results).toEqual([]);
  });

  it('skips a malformed exact match block and keeps the section apps', async () => {
    const section = sectionWithApps(['a', 'b']);
    section[23] = ['garbage'];

    const results = (await search({
      term: 'panda',
      requestOptions: { fetchImpl: fetchReturning(searchPageWithSection(section)) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['a', 'b']);
  });

  it('does not duplicate an exact match already present in the results', async () => {
    const section = sectionWithApps(['a', 'b']);
    section[23] = exactMatchNode('a');

    const results = (await search({
      term: 'panda',
      requestOptions: { fetchImpl: fetchReturning(searchPageWithSection(section)) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['a', 'b']);
  });

  it('prepends a priceless exact match with a derived developerId', async () => {
    const section = sectionWithApps(['a']);
    section[23] = exactMatchNode('x');

    const results = (await search({
      term: 'panda',
      requestOptions: { fetchImpl: fetchReturning(searchPageWithSection(section)) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(results[0]?.developerId).toBe('x-dev');
    expect(results[0]?.price).toBe(0);
    expect(results[0]?.url).toBe('https://play.google.com/store/apps/details?id=x');
  });
});

const paidCoreData = (id: string): unknown[] => {
  const core = coreData(id);
  core[8] = [null, [[990000, 'USD']]];
  return core;
};

const mixedPageHtml = (freeIds: string[], paidIds: string[]): string => {
  const apps = [...freeIds.map((id) => [coreData(id)]), ...paidIds.map((id) => [paidCoreData(id)])];
  const section: unknown[] = [];
  section[22] = [apps];
  return buildScriptData('ds:4', [[null, [section]]]);
};

describe('search price filtering', () => {
  it('keeps only paid apps when price is paid even if the page mixes both', async () => {
    const html = mixedPageHtml(['free1', 'free2'], ['paid1', 'paid2']);

    const results = (await search({
      term: 'panda',
      price: 'paid',
      requestOptions: { fetchImpl: fetchReturning(html) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['paid1', 'paid2']);
    expect(results.every((item) => !item.free)).toBe(true);
  });

  it('keeps only free apps when price is free', async () => {
    const html = mixedPageHtml(['free1'], ['paid1', 'paid2']);

    const results = (await search({
      term: 'panda',
      price: 'free',
      requestOptions: { fetchImpl: fetchReturning(html) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['free1']);
    expect(results.every((item) => item.free)).toBe(true);
  });

  it('returns both free and paid apps when price is all', async () => {
    const html = mixedPageHtml(['free1'], ['paid1']);

    const results = (await search({
      term: 'panda',
      price: 'all',
      requestOptions: { fetchImpl: fetchReturning(html) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId).sort()).toEqual(['free1', 'paid1']);
  });
});

describe('filterByPrice', () => {
  const items = [
    { free: true, appId: 'a' },
    { free: false, appId: 'b' },
    { free: true, appId: 'c' },
  ];

  it('drops paid entries for the free filter and free entries for the paid filter', () => {
    expect(filterByPrice(items, 'free').map((item) => item.appId)).toEqual(['a', 'c']);
    expect(filterByPrice(items, 'paid').map((item) => item.appId)).toEqual(['b']);
  });

  it('returns a copy of every entry for the all filter', () => {
    const result = filterByPrice(items, 'all');
    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });

  it('matches individual entries through matchesPriceFilter', () => {
    expect(matchesPriceFilter(true, 'free')).toBe(true);
    expect(matchesPriceFilter(true, 'paid')).toBe(false);
    expect(matchesPriceFilter(false, 'all')).toBe(true);
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
