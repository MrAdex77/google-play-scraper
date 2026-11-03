import { describe, expectTypeOf, it } from 'vitest';
import gplay, {
  type App,
  createClient,
  developer,
  type DeveloperApp,
  list,
  type ListItem,
  memoized,
  search,
  type SearchResult,
  similar,
  type SimilarApp,
} from './index.ts';

const flag = Math.random() < 2;
const client = createClient();
const cachedClient = memoized();

describe('list return type', () => {
  it('is the same narrowed signature on every entry point', () => {
    expectTypeOf(gplay.list).toEqualTypeOf(list);
    expectTypeOf(client.list).toEqualTypeOf(list);
    expectTypeOf(cachedClient.list).toEqualTypeOf(list);
  });

  it('selects the result type from a literal fullDetail', () => {
    expectTypeOf(() => list({ fullDetail: true })).returns.resolves.toEqualTypeOf<App[]>();
    expectTypeOf(() => list({ fullDetail: false })).returns.resolves.toEqualTypeOf<ListItem[]>();
    expectTypeOf(() => list({})).returns.resolves.toEqualTypeOf<ListItem[]>();
    expectTypeOf(() => list({ fullDetail: flag })).returns.resolves.toEqualTypeOf<
      ListItem[] | App[]
    >();
  });

  it('keeps a boolean fullDetail invalidatable on the memoized client', () => {
    expectTypeOf(() =>
      cachedClient.cache.invalidate('list', { fullDetail: flag }),
    ).returns.toEqualTypeOf<boolean>();
  });
});

describe('search return type', () => {
  it('is the same narrowed signature on every entry point', () => {
    expectTypeOf(gplay.search).toEqualTypeOf(search);
    expectTypeOf(client.search).toEqualTypeOf(search);
    expectTypeOf(cachedClient.search).toEqualTypeOf(search);
  });

  it('selects the result type from a literal fullDetail', () => {
    expectTypeOf(() => search({ term: 'panda', fullDetail: true })).returns.resolves.toEqualTypeOf<
      App[]
    >();
    expectTypeOf(() => search({ term: 'panda', fullDetail: false })).returns.resolves.toEqualTypeOf<
      SearchResult[]
    >();
    expectTypeOf(() => search({ term: 'panda' })).returns.resolves.toEqualTypeOf<SearchResult[]>();
    expectTypeOf(() => search({ term: 'panda', fullDetail: flag })).returns.resolves.toEqualTypeOf<
      SearchResult[] | App[]
    >();
  });

  it('keeps a boolean fullDetail invalidatable on the memoized client', () => {
    expectTypeOf(() =>
      cachedClient.cache.invalidate('search', { term: 'panda', fullDetail: flag }),
    ).returns.toEqualTypeOf<boolean>();
  });
});

describe('developer return type', () => {
  it('is the same narrowed signature on every entry point', () => {
    expectTypeOf(gplay.developer).toEqualTypeOf(developer);
    expectTypeOf(client.developer).toEqualTypeOf(developer);
    expectTypeOf(cachedClient.developer).toEqualTypeOf(developer);
  });

  it('selects the result type from a literal fullDetail', () => {
    expectTypeOf(() =>
      developer({ devId: 'DevCo', fullDetail: true }),
    ).returns.resolves.toEqualTypeOf<App[]>();
    expectTypeOf(() =>
      developer({ devId: 'DevCo', fullDetail: false }),
    ).returns.resolves.toEqualTypeOf<DeveloperApp[]>();
    expectTypeOf(() => developer({ devId: 'DevCo' })).returns.resolves.toEqualTypeOf<
      DeveloperApp[]
    >();
    expectTypeOf(() =>
      developer({ devId: 'DevCo', fullDetail: flag }),
    ).returns.resolves.toEqualTypeOf<DeveloperApp[] | App[]>();
  });

  it('keeps a boolean fullDetail invalidatable on the memoized client', () => {
    expectTypeOf(() =>
      cachedClient.cache.invalidate('developer', { devId: 'DevCo', fullDetail: flag }),
    ).returns.toEqualTypeOf<boolean>();
  });
});

describe('similar return type', () => {
  it('is the same narrowed signature on every entry point', () => {
    expectTypeOf(gplay.similar).toEqualTypeOf(similar);
    expectTypeOf(client.similar).toEqualTypeOf(similar);
    expectTypeOf(cachedClient.similar).toEqualTypeOf(similar);
  });

  it('selects the result type from a literal fullDetail', () => {
    expectTypeOf(() =>
      similar({ appId: 'com.example.app', fullDetail: true }),
    ).returns.resolves.toEqualTypeOf<App[]>();
    expectTypeOf(() =>
      similar({ appId: 'com.example.app', fullDetail: false }),
    ).returns.resolves.toEqualTypeOf<SimilarApp[]>();
    expectTypeOf(() => similar({ appId: 'com.example.app' })).returns.resolves.toEqualTypeOf<
      SimilarApp[]
    >();
    expectTypeOf(() =>
      similar({ appId: 'com.example.app', fullDetail: flag }),
    ).returns.resolves.toEqualTypeOf<SimilarApp[] | App[]>();
  });

  it('keeps a boolean fullDetail invalidatable on the memoized client', () => {
    expectTypeOf(() =>
      cachedClient.cache.invalidate('similar', { appId: 'com.example.app', fullDetail: flag }),
    ).returns.toEqualTypeOf<boolean>();
  });
});
