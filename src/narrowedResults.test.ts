import { describe, expectTypeOf, it } from 'vitest';
import gplay, { createClient, list, memoized, type App, type ListItem } from './index.ts';

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
