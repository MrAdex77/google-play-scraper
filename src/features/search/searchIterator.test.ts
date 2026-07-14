import { describe, expect, it } from 'vitest';
import { createSearchIterator, searchIterator } from './searchIterator.js';
import { searchResultSchema } from './schema.js';
import { ValidationError } from '../../core/errors.js';

const sequenceFetch = (bodies: string[]): { fetchImpl: typeof fetch; count: () => number } => {
  let index = 0;
  const impl: typeof fetch = () => {
    const body = bodies[Math.min(index, bodies.length - 1)] ?? '';
    index += 1;
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl: impl, count: () => index };
};

const buildScriptData = (key: string, value: unknown): string =>
  `<script>AF_initDataCallback({key: '${key}', hash: '1', data:${JSON.stringify(value)}, sideChannel: {}});</script>`;

const coreData = (id: string, priceMicros = 0): unknown[] => {
  const core: unknown[] = [];
  core[0] = [id];
  core[1] = [null, null, null, [null, null, `https://icon.example/${id}`]];
  core[3] = `App ${id}`;
  core[4] = ['4.5', 4.5];
  core[8] = [null, [[priceMicros, 'USD']]];
  core[10] = [null, null, null, null, [null, null, `/store/apps/details?id=${id}`]];
  core[13] = [null, `Summary of ${id}`];
  core[14] = `Dev ${id}`;
  return core;
};

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

const searchPageHtml = (ids: string[], token: string, exactMatchId?: string): string => {
  const section: unknown[] = [];
  section[22] = [ids.map((id) => [coreData(id)]), [null, null, null, [null, token]]];
  if (exactMatchId !== undefined) {
    section[23] = exactMatchNode(exactMatchId);
  }
  return buildScriptData('ds:4', [[null, [section]]]);
};

const clusterBatch = (
  entries: { id: string; priceMicros?: number }[],
  nextToken: string | null,
): string => {
  const apps = entries.map((entry) => coreData(entry.id, entry.priceMicros ?? 0));
  const inner: unknown[] = [];
  inner[0] = apps;
  inner[7] = [null, nextToken];
  const payload = [[inner]];
  const frame = [['wrb.fr', 'qnKhOb', JSON.stringify(payload), null, null, null, 'generic']];
  const json = JSON.stringify(frame);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
};

const collect = async (
  generator: AsyncGenerator<{ appId: string }>,
  limit = Infinity,
): Promise<string[]> => {
  const ids: string[] = [];
  for await (const item of generator) {
    ids.push(item.appId);
    if (ids.length >= limit) {
      break;
    }
  }
  return ids;
};

describe('searchIterator laziness', () => {
  it('performs zero fetches before consumption', () => {
    const { fetchImpl, count } = sequenceFetch([searchPageHtml(['a'], 'next')]);
    searchIterator({ term: 'panda', requestOptions: { fetchImpl } });
    expect(count()).toBe(0);
  });

  it('stops fetching when the consumer breaks after the first page', async () => {
    const { fetchImpl, count } = sequenceFetch([
      searchPageHtml(['a', 'b', 'c'], 'next'),
      clusterBatch([{ id: 'd' }], null),
    ]);

    const ids = await collect(searchIterator({ term: 'panda', requestOptions: { fetchImpl } }), 2);

    expect(ids).toEqual(['a', 'b']);
    expect(count()).toBe(1);
  });
});

describe('searchIterator streaming', () => {
  it('applies the price filter to continuation pages', async () => {
    const { fetchImpl } = sequenceFetch([
      searchPageHtml(['free1'], 'next'),
      clusterBatch([{ id: 'paid1', priceMicros: 990000 }, { id: 'free2' }], null),
    ]);

    const ids: string[] = [];
    for await (const item of searchIterator({
      term: 'panda',
      price: 'paid',
      requestOptions: { fetchImpl },
    })) {
      expect(() => searchResultSchema.parse(item)).not.toThrow();
      ids.push(item.appId);
    }

    expect(ids).toEqual(['paid1']);
  });

  it('prepends the exact match exactly once across pages', async () => {
    const { fetchImpl } = sequenceFetch([
      searchPageHtml(['a', 'b'], 'next', 'exact'),
      clusterBatch([{ id: 'c' }], null),
    ]);

    const ids = await collect(searchIterator({ term: 'panda', requestOptions: { fetchImpl } }));

    expect(ids).toEqual(['exact', 'a', 'b', 'c']);
    expect(ids.filter((id) => id === 'exact')).toHaveLength(1);
  });
});

describe('searchIterator validation', () => {
  it('throws a ValidationError synchronously for a missing term', () => {
    expect(() => searchIterator({ term: '' })).toThrow(ValidationError);
  });

  it('routes through an injected resolveClient', async () => {
    const { fetchImpl } = sequenceFetch([searchPageHtml(['a'], 'next'), clusterBatch([], null)]);
    const bound = createSearchIterator(() => ({
      request: (req) =>
        fetchImpl(req.url, { method: req.method, body: req.body }).then((response) =>
          response.text(),
        ),
    }));

    const ids = await collect(bound({ term: 'panda' }));

    expect(ids).toEqual(['a']);
  });
});
