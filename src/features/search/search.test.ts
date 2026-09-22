import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSearch, search, type SearchOptions } from './search.js';
import {
  filterByPrice,
  isExactMatchCard,
  matchesPriceFilter,
  SEARCH_RPC_ID,
  searchScriptDataSelection,
} from './specs.js';
import { getPath } from '../../core/path.js';
import { parseScriptData } from '../../core/scriptData.js';
import {
  changeRoutingTableEntry,
  deletePath,
  replaceScriptBlockData,
} from '../../../test/helpers/responseMutation.js';
import { memoized } from '../memoized/memoized.js';
import { searchResultSchema, type SearchResult } from './schema.js';
import type { App } from '../app/schema.js';
import type { DegradationEvent, OnDegradation } from '../../core/degradation.js';
import { ParseError, ValidationError } from '../../core/errors.js';
import type { IntegrityEvent, OnIntegrityEvent } from '../../core/integrity.js';

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/search/${name}`, import.meta.url)),
    'utf8',
  );

const pandaHtml = readFixture('panda.html');
const whereAmIHtml = readFixture('where-am-i.html');
const biedronkaHtml = readFixture('biedronka-pl.html');

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

const buildServiceTable = (entries: Record<string, string>): string => {
  const pairs = Object.entries(entries)
    .map(([key, rpcId]) => `'${key}' : {id:'${rpcId}'}`)
    .join(',');
  return `<script>; var AF_dataServiceRequests = {${pairs}}; var AF_initDataChunkQueue = [];</script>`;
};

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

const searchPageRoot = (ids: string[], token: string): unknown => {
  const apps = ids.map((id) => [coreData(id)]);
  const section: unknown[] = [];
  section[22] = [apps, [null, null, null, [null, token]]];
  return [[null, [section]]];
};

const searchPageHtml = (ids: string[], token: string): string =>
  buildScriptData('ds:4', searchPageRoot(ids, token));

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

  it('parses a search root moved behind the lGYRle route', async () => {
    const html = `${buildScriptData('ds:4', ['malformed fallback'])}${buildScriptData(
      'ds:11',
      searchPageRoot(['routed'], ''),
    )}${buildServiceTable({ 'ds:11': SEARCH_RPC_ID })}`;

    const results = (await search({
      term: 'routed',
      requestOptions: { fetchImpl: fetchReturning(html) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['routed']);
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

const exactMatchDetail = (id: string): unknown[] => {
  const detail: unknown[] = [];
  detail[0] = [`App ${id}`];
  detail[68] = [
    `Dev ${id}`,
    [null, null, null, null, [null, null, `/store/apps/dev?id=${id}-dev`]],
  ];
  detail[73] = [[null, `Summary of ${id}`]];
  detail[95] = [[null, null, null, [null, null, `https://icon.example/${id}`]]];
  return detail;
};

const offerContainer = (id: string): unknown[] => [
  [null, null, null, null, [null, null, `/store/apps/details?id=${id}`]],
];

const primaryOfferNode = (id: string): unknown[] => [offerContainer(id)];

const primaryOfferNodeWithPrice = (id: string, micros: number, currency: string): unknown[] => {
  const container = offerContainer(id);
  container[2] = [[null, [[micros, currency, '']]]];
  return [container];
};

const detailOfferNode = (micros: number, currency: string): unknown => [
  [[[[null, [[micros, currency, '']]]]]],
];

const detailUrlNode = (id: string): unknown => [
  [null, null, `https://play.google.com/store/apps/details?id=${id}`],
];

const detailWithOffer = (id: string, micros: number, currency: string): unknown[] => {
  const detail = exactMatchDetail(id);
  detail[41] = detailUrlNode(id);
  detail[57] = detailOfferNode(micros, currency);
  return detail;
};

const exactMatchCard = (id: string, detail: unknown[], offer?: unknown): unknown[] => {
  const node16: unknown[] = [];
  node16[2] = detail;
  node16[3] = { '12': [[id]] };
  const card: unknown[] = [];
  card[16] = node16;
  if (offer !== undefined) {
    card[17] = offer;
  }
  return card;
};

const exactMatchNode = (id: string): unknown[] =>
  exactMatchCard(id, exactMatchDetail(id), primaryOfferNode(id));

const searchPageWithSections = (sections: readonly unknown[]): string =>
  `${buildScriptData('ds:4', [[null, sections]])}${buildServiceTable({ 'ds:4': SEARCH_RPC_ID })}`;

const searchPageWithSection = (section: unknown[]): string => searchPageWithSections([section]);

const cardSection = (card: unknown, index = 23): unknown[] => {
  const section: unknown[] = [];
  section[index] = card;
  return section;
};

const searchOn = async (html: string, events: IntegrityEvent[] = []): Promise<SearchResult[]> =>
  search({
    term: 'panda',
    onIntegrityEvent: (event) => events.push(event),
    requestOptions: { fetchImpl: fetchReturning(html) },
  });

const sectionWithApps = (ids: string[]): unknown[] => {
  const section: unknown[] = [];
  section[22] = [ids.map((id) => [coreData(id)])];
  return section;
};

describe('search malformed pages', () => {
  it('rejects a response whose sections block is not an array', async () => {
    const html = buildScriptData('ds:4', [[null, 'not-sections']]);

    await expect(
      search({
        term: 'panda',
        requestOptions: { fetchImpl: fetchReturning(html) },
      }),
    ).rejects.toBeInstanceOf(ParseError);
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
    const events: IntegrityEvent[] = [];

    const results = (await search({
      term: 'panda',
      onIntegrityEvent: (event) => events.push(event),
      requestOptions: { fetchImpl: fetchReturning(searchPageWithSection(section)) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['a', 'b']);
    expect(events).toHaveLength(1);
    expect(events[0]?.context).toBe('search');
    expect(events[0]?.reason).toBe('optional-section-parse');
    expect(events[0]?.error).toBeInstanceOf(ParseError);
  });

  it('emits nothing when the exact match block is absent', async () => {
    const events: IntegrityEvent[] = [];
    const results = (await search({
      term: 'panda',
      onIntegrityEvent: (event) => events.push(event),
      requestOptions: {
        fetchImpl: fetchReturning(searchPageWithSection(sectionWithApps(['a', 'b']))),
      },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['a', 'b']);
    expect(events).toEqual([]);
  });

  it('keeps ordinary results when no exact match observer is configured', async () => {
    const section = sectionWithApps(['a', 'b']);
    section[23] = ['garbage'];

    const results = (await search({
      term: 'panda',
      requestOptions: { fetchImpl: fetchReturning(searchPageWithSection(section)) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['a', 'b']);
  });

  it('lets a throwing exact match callback surface to the consumer', async () => {
    const section = sectionWithApps(['a']);
    section[23] = ['garbage'];

    await expect(
      search({
        term: 'panda',
        onIntegrityEvent: () => {
          throw new Error('consumer handler bug');
        },
        requestOptions: { fetchImpl: fetchReturning(searchPageWithSection(section)) },
      }),
    ).rejects.toThrow('consumer handler bug');
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
    expect(results[0]?.free).toBe(false);
    expect(results[0]?.url).toBe('https://play.google.com/store/apps/details?id=x');
  });

  it('keeps an exact match with a present invalid developer link', async () => {
    const section = sectionWithApps(['a']);
    const exactMatch = exactMatchNode('x');
    const node16 = exactMatch[16] as unknown[];
    const detail = node16[2] as unknown[];
    const developer = detail[68] as unknown[];
    const developerMetadata = developer[1] as unknown[];
    const developerLink = developerMetadata[4] as unknown[];
    developerLink[2] = 42;
    section[23] = exactMatch;

    const results = (await search({
      term: 'panda',
      requestOptions: { fetchImpl: fetchReturning(searchPageWithSection(section)) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(results[0]?.developerId).toBeUndefined();
  });
});

const paidCoreData = (id: string): unknown[] => {
  const core = coreData(id);
  core[8] = [null, [[990000, 'USD']]];
  return core;
};

const preregisterCoreData = (id: string): unknown[] => {
  const core = coreData(id);
  core[8] = null;
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

  it('keeps a preregistration row without an offer node instead of failing the page', async () => {
    const apps = [[coreData('free1')], [preregisterCoreData('prereg1')], [paidCoreData('paid1')]];
    const section: unknown[] = [];
    section[22] = [apps];
    const html = buildScriptData('ds:4', [[null, [section]]]);

    const results = (await search({
      term: 'panda',
      requestOptions: { fetchImpl: fetchReturning(html) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['free1', 'prereg1', 'paid1']);
    const preregister = results.find((item) => item.appId === 'prereg1');
    expect(preregister?.price).toBe(0);
    expect(preregister?.free).toBe(false);
    expect(preregister?.currency).toBeUndefined();
  });

  it('excludes an offerless preregistration row from a free price filter', async () => {
    const apps = [[coreData('free1')], [preregisterCoreData('prereg1')]];
    const section: unknown[] = [];
    section[22] = [apps];
    const html = buildScriptData('ds:4', [[null, [section]]]);

    const results = (await search({
      term: 'panda',
      price: 'free',
      requestOptions: { fetchImpl: fetchReturning(html) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['free1']);
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

const reroutedAppHtml = changeRoutingTableEntry(
  readFileSync(
    fileURLToPath(new URL('../../../test/fixtures/app/translate.html', import.meta.url)),
    'utf8',
  ),
  'ds:5',
  { rpcId: 'unrelatedRpc' },
);

const detailRoutingFetch = (): { fetchImpl: typeof fetch; count: () => number } => {
  let calls = 0;
  const fetchImpl: typeof fetch = (input) => {
    calls += 1;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = url.includes('/store/apps/details') ? reroutedAppHtml : pandaHtml;
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl, count: () => calls };
};

describe('search fullDetail', () => {
  it('forwards per-call observability callbacks to each detail lookup', async () => {
    const onDegradation: OnDegradation = () => undefined;
    const onIntegrityEvent: OnIntegrityEvent = () => undefined;
    const received: [unknown, unknown][] = [];
    const detailed = createSearch((params) => {
      received.push([params.onDegradation, params.onIntegrityEvent]);
      return Promise.resolve({ appId: params.appId } as App);
    });

    await detailed({
      term: 'panda',
      num: 3,
      requestOptions: { fetchImpl: fetchReturning(pandaHtml) },
      fullDetail: true,
      onDegradation,
      onIntegrityEvent,
    });

    expect(received.length).toBeGreaterThan(0);
    for (const pair of received) {
      expect(pair).toEqual([onDegradation, onIntegrityEvent]);
    }
  });

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
  it('reports app integrity events from detail lookups to the search callback', async () => {
    const contexts: string[] = [];

    await search({
      term: 'panda',
      num: 2,
      fullDetail: true,
      onIntegrityEvent: (event) => contexts.push(event.context),
      requestOptions: { fetchImpl: detailRoutingFetch().fetchImpl },
    });

    expect(contexts).toEqual(['app details', 'app details']);
  });

  it('replays detail integrity events on a memoized hit to the per-call callback only', async () => {
    const clientContexts: string[] = [];
    const routing = detailRoutingFetch();
    const client = memoized({
      onIntegrityEvent: (event) => clientContexts.push(event.context),
      requestOptions: { fetchImpl: routing.fetchImpl },
    });
    const detailedSearch = (contexts: string[]) =>
      client.search({
        term: 'panda',
        num: 2,
        fullDetail: true,
        onIntegrityEvent: (event) => contexts.push(event.context),
      });

    const missContexts: string[] = [];
    await detailedSearch(missContexts);
    const fetchesAfterMiss = routing.count();
    const hitContexts: string[] = [];
    await detailedSearch(hitContexts);

    expect(routing.count()).toBe(fetchesAfterMiss);
    expect(missContexts).toEqual(['app details', 'app details']);
    expect(hitContexts).toEqual(['app details', 'app details']);
    expect(clientContexts).toEqual([]);
  });
});

describe('search exact match resolution', () => {
  it('prepends a card anchored in the first section', async () => {
    const html = searchPageWithSections([cardSection(exactMatchNode('x')), sectionWithApps(['a'])]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(events).toEqual([]);
  });

  it('prepends a card anchored in a later section', async () => {
    const html = searchPageWithSections([
      [],
      cardSection(exactMatchNode('x')),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(events).toEqual([]);
  });

  it('prepends a card anchored in the same section as the results', async () => {
    const section = sectionWithApps(['a']);
    section[23] = exactMatchNode('x');
    const events: IntegrityEvent[] = [];

    const results = await searchOn(searchPageWithSection(section), events);

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(events).toEqual([]);
  });

  it('resolves a card that moved off its anchor index and reports the fallback', async () => {
    const html = searchPageWithSections([
      cardSection(exactMatchNode('x'), 24),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('section-anchor-fallback');
    expect(events[0]?.context).toBe('search');
    expect(events[0]?.error).toBeInstanceOf(ParseError);
    expect(events[0]?.error.message).toContain('sections.0.24');
  });

  it('prefers an anchored card over a card reachable only by scanning', async () => {
    const html = searchPageWithSections([
      cardSection(exactMatchNode('x')),
      cardSection(exactMatchNode('y'), 24),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(events).toEqual([]);
  });

  it('prefers a later anchored card over an earlier unusable anchor', async () => {
    const html = searchPageWithSections([
      cardSection(['garbage']),
      cardSection(exactMatchNode('x')),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(events).toEqual([]);
  });

  it('scans past an unusable anchor when the card moved off its index', async () => {
    const html = searchPageWithSections([
      cardSection(['garbage']),
      cardSection(exactMatchNode('x'), 24),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('section-anchor-fallback');
    expect(events[0]?.error.message).toContain('sections.1.24');
  });

  it('reports the unusable anchor when no card can be resolved anywhere', async () => {
    const html = searchPageWithSections([cardSection(['garbage']), sectionWithApps(['a', 'b'])]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['a', 'b']);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('optional-section-parse');
  });

  it('skips a non array section while scanning', async () => {
    const html = searchPageWithSections([
      'not-a-section',
      cardSection(exactMatchNode('x'), 24),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('section-anchor-fallback');
  });

  it('never mistakes an ordinary result row for a card', async () => {
    const events: IntegrityEvent[] = [];

    const results = await searchOn(searchPageWithSection(sectionWithApps(['a', 'b'])), events);

    expect(results.map((item) => item.appId)).toEqual(['a', 'b']);
    expect(events).toEqual([]);
  });

  it('does not duplicate a scanned card already present in the results', async () => {
    const html = searchPageWithSections([
      cardSection(exactMatchNode('a'), 24),
      sectionWithApps(['a', 'b']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['a', 'b']);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('section-anchor-fallback');
  });

  it('returns the card alone when the page carries no result list', async () => {
    const emptySection: unknown[] = [];
    emptySection[22] = [[]];
    const html = searchPageWithSections([cardSection(exactMatchNode('x')), emptySection]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x']);
    expect(events).toEqual([]);
  });

  it('returns the card alone when it moved off its anchor and no list exists', async () => {
    const html = searchPageWithSections([cardSection(exactMatchNode('x'), 24)]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x']);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('section-anchor-fallback');
  });

  it('resolves a moved card when no integrity observer is configured', async () => {
    const html = searchPageWithSections([
      cardSection(exactMatchNode('x'), 24),
      sectionWithApps(['a']),
    ]);

    const results = (await search({
      term: 'panda',
      requestOptions: { fetchImpl: fetchReturning(html) },
    })) as SearchResult[];

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
  });
});

describe('search exact match offer fallbacks', () => {
  it('reads url, price and currency from the detail offer node', async () => {
    const html = searchPageWithSections([
      cardSection(exactMatchCard('x', detailWithOffer('x', 0, 'EUR'))),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results[0]?.appId).toBe('x');
    expect(results[0]?.url).toBe('https://play.google.com/store/apps/details?id=x');
    expect(results[0]?.currency).toBe('EUR');
    expect(results[0]?.price).toBe(0);
    expect(results[0]?.free).toBe(true);
    expect(events).toEqual([]);
  });

  it('derives a paid card from the detail offer node', async () => {
    const html = searchPageWithSections([
      cardSection(exactMatchCard('x', detailWithOffer('x', 4_990_000, 'PLN'))),
      sectionWithApps(['a']),
    ]);

    const results = await searchOn(html);

    expect(results[0]?.price).toBe(4.99);
    expect(results[0]?.free).toBe(false);
    expect(results[0]?.currency).toBe('PLN');
  });

  it('prefers the primary offer node over the detail offer node', async () => {
    const detail = detailWithOffer('detail', 9_990_000, 'EUR');
    const card = exactMatchCard('x', detail, primaryOfferNodeWithPrice('x', 0, 'USD'));
    const html = searchPageWithSections([cardSection(card), sectionWithApps(['a'])]);

    const results = await searchOn(html);

    expect(results[0]?.url).toBe('https://play.google.com/store/apps/details?id=x');
    expect(results[0]?.currency).toBe('USD');
    expect(results[0]?.price).toBe(0);
    expect(results[0]?.free).toBe(true);
  });

  it('drops the card and reports it when no url node resolves', async () => {
    const card = exactMatchCard('x', exactMatchDetail('x'));
    const html = searchPageWithSections([cardSection(card), sectionWithApps(['a'])]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['a']);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('optional-section-parse');
    expect(events[0]?.error.message).toContain('url');
  });
});

describe('search exact match anchor selection', () => {
  it('prefers a later anchored card over an earlier card that cannot be extracted', async () => {
    const html = searchPageWithSections([
      cardSection(exactMatchCard('decoy', [])),
      cardSection(exactMatchNode('x')),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(events).toEqual([]);
  });

  it('prefers a later anchored card over an earlier card reachable only by scanning', async () => {
    const html = searchPageWithSections([
      cardSection(exactMatchNode('y'), 24),
      cardSection(exactMatchNode('x')),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(events).toEqual([]);
  });

  it('ignores a non card node parked at a later section anchor', async () => {
    const html = searchPageWithSections([sectionWithApps(['a']), [], cardSection(['noise'])]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['a']);
    expect(events).toEqual([]);
  });

  it('treats a null anchor as an absent card', async () => {
    const html = searchPageWithSections([cardSection(null), sectionWithApps(['a'])]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['a']);
    expect(events).toEqual([]);
  });

  it('reports the first section anchor once when several anchors are unusable', async () => {
    const html = searchPageWithSections([
      cardSection(['garbage']),
      sectionWithApps(['a']),
      cardSection(['more-garbage']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['a']);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('optional-section-parse');
  });

  it('keeps scanning past a card that cannot be extracted', async () => {
    const html = searchPageWithSections([
      cardSection(exactMatchCard('broken', []), 24),
      cardSection(exactMatchNode('x'), 25),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['x', 'a']);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('section-anchor-fallback');
    expect(events[0]?.error.message).toContain('sections.1.25');
  });

  it('reports the scanned card rather than an unrelated node at the first anchor', async () => {
    const html = searchPageWithSections([
      cardSection(['noise']),
      cardSection(exactMatchCard('broken', []), 24),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['a']);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('optional-section-parse');
    expect(events[0]?.error.message).not.toContain('appId');
  });

  it('reports an unextractable card found only by scanning', async () => {
    const html = searchPageWithSections([
      cardSection(exactMatchCard('x', []), 24),
      sectionWithApps(['a']),
    ]);
    const events: IntegrityEvent[] = [];

    const results = await searchOn(html, events);

    expect(results.map((item) => item.appId)).toEqual(['a']);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('optional-section-parse');
  });
});

describe('search exact match offer mirror against the recorded card', () => {
  const pandaWithoutOfferNode = (): string => {
    const root = parseScriptData(pandaHtml, searchScriptDataSelection).blocks['ds:4'];
    return replaceScriptBlockData(pandaHtml, 'ds:4', deletePath(root, [0, 1, 0, 23, 17]));
  };

  it('resolves url, price, currency and free from the detail node of the real card', async () => {
    const events: IntegrityEvent[] = [];

    const results = await searchOn(pandaWithoutOfferNode(), events);

    expect(results[0]?.appId).toBe('com.pandaexpress.app');
    expect(results[0]?.url).toBe(
      'https://play.google.com/store/apps/details?id=com.pandaexpress.app',
    );
    expect(results[0]?.price).toBe(0);
    expect(results[0]?.currency).toBe('USD');
    expect(results[0]?.free).toBe(true);
    expect(events).toEqual([]);
  });

  it('agrees with the primary offer node the recorded card still carries', async () => {
    const withMirror = await searchOn(pandaWithoutOfferNode());
    const withPrimary = await searchOn(pandaHtml);

    expect(withMirror[0]?.url).toBe(withPrimary[0]?.url);
    expect(withMirror[0]?.price).toBe(withPrimary[0]?.price);
    expect(withMirror[0]?.currency).toBe(withPrimary[0]?.currency);
    expect(withMirror[0]?.free).toBe(withPrimary[0]?.free);
  });

  it('reads each offer field from its own node when the two are mixed', async () => {
    const detail = detailWithOffer('x', 4_990_000, 'PLN');
    const card = exactMatchCard('x', detail, primaryOfferNode('x'));
    const html = searchPageWithSections([cardSection(card), sectionWithApps(['a'])]);

    const results = await searchOn(html);

    expect(results[0]?.url).toBe('https://play.google.com/store/apps/details?id=x');
    expect(results[0]?.price).toBe(4.99);
    expect(results[0]?.currency).toBe('PLN');
    expect(results[0]?.free).toBe(false);
  });
});

describe('search exact match on a recorded multi section page', () => {
  const biedronkaSections = (): unknown =>
    getPath(parseScriptData(biedronkaHtml, searchScriptDataSelection).blocks['ds:4'], [0, 1]);

  it('still records a page whose card sits outside the first section', () => {
    const sections = biedronkaSections();

    expect(
      isExactMatchCard(getPath(sections, [0, 23])),
      're-record search/biedronka-pl.html from a query that still serves a card outside the first section',
    ).toBe(false);
    expect(isExactMatchCard(getPath(sections, [1, 23]))).toBe(true);
  });

  it('returns the card google renders above the result list', async () => {
    const events: IntegrityEvent[] = [];

    const results = await searchOn(biedronkaHtml, events);

    expect(results[0]?.appId).toBe('pl.jmpolska.clos0.mojabiedronka');
    expect(results[0]?.developerId).toBeDefined();
    expect(events).toEqual([]);
  });
});
