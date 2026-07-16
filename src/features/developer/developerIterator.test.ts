import { describe, expect, it } from 'vitest';
import { createDeveloperIterator, developerIterator } from './developerIterator.js';
import { developerAppSchema } from './schema.js';
import type { DegradationEvent } from '../../core/degradation.js';
import { ParseError, ValidationError } from '../../core/errors.js';

const sequenceFetch = (bodies: string[]): { fetchImpl: typeof fetch; count: () => number } => {
  let index = 0;
  const impl: typeof fetch = () => {
    const body = bodies[Math.min(index, bodies.length - 1)] ?? '';
    index += 1;
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl: impl, count: () => index };
};

const buildDsThree = (data: unknown): string =>
  `<script>AF_initDataCallback({key: 'ds:3', hash: '1', data:${JSON.stringify(data)}, sideChannel: {}});</script>`;

const clusterAppItem = (id: string): unknown[] => {
  const item: unknown[] = [];
  item[2] = `App ${id}`;
  item[12] = [id];
  item[9] = [null, null, null, null, [null, null, `/store/apps/details?id=${id}`]];
  item[1] = [null, [[null, null, null, [null, null, `https://icon.example/${id}`]]]];
  item[4] = [[[`Dev ${id}`]], [null, [null, [null, `Summary of ${id}`]]]];
  item[6] = [[null, null, [null, ['4.5', 4.5]]]];
  return item;
};

const numericCore = (id: string): unknown[] => {
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

const numericPageHtml = (ids: string[], token: string | null): string => {
  const cluster: unknown[] = [];
  cluster[0] = ids.map((id) => numericCore(id));
  cluster[1] = [null, null, null, [null, token]];
  const holder: unknown[] = [];
  holder[21] = cluster;
  return buildDsThree([[null, [holder]]]);
};

const pricelessNameCore = (id: string): unknown[] => {
  const core: unknown[] = [];
  core[0] = [id];
  core[1] = [null, null, null, [null, null, `https://icon.example/${id}`]];
  core[3] = `App ${id}`;
  core[10] = [null, null, null, null, [null, null, `/store/apps/details?id=${id}`]];
  core[14] = `Dev ${id}`;
  return core;
};

const namePageHtml = (ids: string[]): string => {
  const section: unknown[] = [];
  section[22] = [ids.map((id) => [pricelessNameCore(id)])];
  return buildDsThree([[null, [section]]]);
};

const clusterBatchOf = (apps: unknown[], nextToken: string | null): string => {
  const clusterNode: unknown[] = [];
  clusterNode[0] = apps;
  clusterNode[7] = [null, nextToken];
  const wrap: unknown[] = [];
  wrap[6] = clusterNode;
  const payload = [wrap];
  const frame = [['wrb.fr', 'qnKhOb', JSON.stringify(payload), null, null, null, 'generic']];
  const json = JSON.stringify(frame);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
};

const clusterBatch = (ids: string[], nextToken: string | null): string =>
  clusterBatchOf(
    ids.map((id) => clusterAppItem(id)),
    nextToken,
  );

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

describe('developerIterator layouts', () => {
  it('streams a numeric devId page across a continuation page', async () => {
    const { fetchImpl } = sequenceFetch([
      numericPageHtml(['n0', 'n1'], 'next'),
      clusterBatch(['n2'], null),
    ]);

    const ids: string[] = [];
    for await (const item of developerIterator({
      devId: '5700313618786177705',
      requestOptions: { fetchImpl },
    })) {
      expect(() => developerAppSchema.parse(item)).not.toThrow();
      ids.push(item.appId);
    }

    expect(ids).toEqual(['n0', 'n1', 'n2']);
  });

  it('reports a degradation event and ends the stream when a continuation is malformed', async () => {
    const { fetchImpl } = sequenceFetch([
      numericPageHtml(['n0', 'n1'], 'next'),
      clusterBatchOf([[42]], null),
    ]);
    const events: DegradationEvent[] = [];

    const ids: string[] = [];
    for await (const item of developerIterator({
      devId: '5700313618786177705',
      onDegradation: (event) => events.push(event),
      requestOptions: { fetchImpl },
    })) {
      ids.push(item.appId);
    }

    expect(ids).toEqual(['n0', 'n1']);
    expect(events).toHaveLength(1);
    expect(events[0]?.context).toBe('developer');
    expect(events[0]?.reason).toBe('cluster-page-parse');
    expect(events[0]?.error).toBeInstanceOf(ParseError);
  });

  it('streams a name devId page', async () => {
    const { fetchImpl } = sequenceFetch([namePageHtml(['com.adex77.WhereAmI'])]);

    const ids = await collect(
      developerIterator({ devId: 'Adex77', requestOptions: { fetchImpl } }),
    );

    expect(ids).toEqual(['com.adex77.WhereAmI']);
  });
});

describe('developerIterator laziness', () => {
  it('performs zero fetches before consumption', () => {
    const { fetchImpl, count } = sequenceFetch([numericPageHtml(['n0'], 'next')]);
    developerIterator({ devId: '5700313618786177705', requestOptions: { fetchImpl } });
    expect(count()).toBe(0);
  });

  it('stops fetching when the consumer breaks after the first page', async () => {
    const { fetchImpl, count } = sequenceFetch([
      numericPageHtml(['n0', 'n1'], 'next'),
      clusterBatch(['n2'], null),
    ]);

    const ids = await collect(
      developerIterator({ devId: '5700313618786177705', requestOptions: { fetchImpl } }),
      1,
    );

    expect(ids).toEqual(['n0']);
    expect(count()).toBe(1);
  });
});

describe('developerIterator validation', () => {
  it('throws a ValidationError synchronously for a missing devId', () => {
    expect(() => developerIterator({ devId: '' })).toThrow(ValidationError);
  });

  it('routes through an injected resolveClient', async () => {
    const { fetchImpl } = sequenceFetch([namePageHtml(['com.adex77.WhereAmI'])]);
    const bound = createDeveloperIterator(() => ({
      request: (req) =>
        fetchImpl(req.url, { method: req.method, body: req.body }).then((response) =>
          response.text(),
        ),
    }));

    const ids = await collect(bound({ devId: 'Adex77' }));

    expect(ids).toEqual(['com.adex77.WhereAmI']);
  });
});
