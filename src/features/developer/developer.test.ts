import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDeveloper, developer, type DeveloperOptions } from './developer.js';
import { developerAppSchema, type DeveloperApp } from './schema.js';
import { developerUrl } from './specs.js';
import type { App } from '../app/schema.js';
import { ValidationError } from '../../core/errors.js';

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/developer/${name}`, import.meta.url)),
    'utf8',
  );

const googleHtml = readFixture('google.html');
const mojangHtml = readFixture('mojang.html');

const fetchReturning = (body: string): typeof fetch => {
  const impl: typeof fetch = () => Promise.resolve(new Response(body, { status: 200 }));
  return impl;
};

const sequenceFetch = (bodies: string[]): { fetchImpl: typeof fetch; count: () => number } => {
  let index = 0;
  const impl: typeof fetch = () => {
    const body = bodies[Math.min(index, bodies.length - 1)] ?? '';
    index += 1;
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl: impl, count: () => index };
};

const appListItem = (id: string): unknown[] => {
  const item: unknown[] = [];
  item[2] = `App ${id}`;
  item[12] = [id];
  item[9] = [null, null, null, null, [null, null, `/store/apps/details?id=${id}`]];
  item[1] = [null, [[null, null, null, [null, null, `https://icon.example/${id}`]]]];
  item[4] = [[[`Dev ${id}`]], [null, [null, [null, `Summary of ${id}`]]]];
  item[6] = [[null, null, [null, ['4.5', 4.5]]]];
  return item;
};

const developerBatch = (ids: string[], nextToken: string | null): string => {
  const clusterNode: unknown[] = [];
  clusterNode[0] = ids.map((id) => appListItem(id));
  clusterNode[7] = [null, nextToken];
  const wrap: unknown[] = [];
  wrap[6] = clusterNode;
  const payload = [wrap];
  const frame = [['wrb.fr', 'qnKhOb', JSON.stringify(payload), null, null, null, 'generic']];
  const json = JSON.stringify(frame);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
};

describe('developer url selection', () => {
  it('routes an all-digit devId through the numeric dev path', () => {
    const url = developerUrl('5700313618786177705', 'en', 'us');
    expect(url).toContain('/store/apps/dev?');
    expect(url).not.toContain('/store/apps/developer?');
    expect(url).toContain('id=5700313618786177705');
  });

  it('routes a name devId through the developer path with encoding', () => {
    expect(developerUrl('Mojang', 'en', 'us')).toContain('/store/apps/developer?id=Mojang');
    expect(developerUrl('DO Global', 'en', 'us')).toContain('id=DO+Global');
  });
});

describe('developer fixture parsing', () => {
  it('parses at least twenty validated apps across the numeric fixture and a follow page', async () => {
    const { fetchImpl } = sequenceFetch([
      googleHtml,
      developerBatch(['g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10'], null),
    ]);

    const items = (await developer({
      devId: '5700313618786177705',
      num: 40,
      requestOptions: { fetchImpl },
    })) as DeveloperApp[];

    expect(items.length).toBeGreaterThanOrEqual(20);
    for (const item of items) {
      expect(() => developerAppSchema.parse(item)).not.toThrow();
      expect(item.url.startsWith('https://play.google.com')).toBe(true);
    }
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);
  });

  it('parses at least three validated apps from the Mojang name fixture', async () => {
    const items = (await developer({
      devId: 'Mojang',
      requestOptions: { fetchImpl: fetchReturning(mojangHtml) },
    })) as DeveloperApp[];

    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const item of items) {
      expect(() => developerAppSchema.parse(item)).not.toThrow();
    }
    expect(items.map((item) => item.appId)).toContain('com.mojang.minecraftpe');
  });
});

describe('developer pagination', () => {
  it('composes a follow-up page when the initial page carries a token', async () => {
    const { fetchImpl, count } = sequenceFetch([
      googleHtml,
      developerBatch(['x0', 'x1', 'x2'], null),
    ]);

    const items = (await developer({
      devId: '5700313618786177705',
      num: 13,
      requestOptions: { fetchImpl },
    })) as DeveloperApp[];

    expect(count()).toBe(2);
    expect(items).toHaveLength(13);
    expect(items.map((item) => item.appId)).toContain('x0');
  });

  it('skips pagination when the first page already satisfies num', async () => {
    const { fetchImpl, count } = sequenceFetch([googleHtml, developerBatch(['x0'], null)]);

    const items = (await developer({
      devId: '5700313618786177705',
      num: 5,
      requestOptions: { fetchImpl },
    })) as DeveloperApp[];

    expect(count()).toBe(1);
    expect(items).toHaveLength(5);
  });
});

describe('developer options', () => {
  it('rejects a missing devId through validation', async () => {
    await expect(developer({} as DeveloperOptions)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('developer fullDetail', () => {
  it('resolves each app through the injected getApp exactly once', async () => {
    const plain = (await developer({
      devId: 'Mojang',
      requestOptions: { fetchImpl: fetchReturning(mojangHtml) },
    })) as DeveloperApp[];

    const requested: string[] = [];
    const detailed = createDeveloper((params) => {
      requested.push(params.appId);
      return Promise.resolve({ appId: params.appId, description: `detail ${params.appId}` } as App);
    });

    const apps = (await detailed({
      devId: 'Mojang',
      fullDetail: true,
      requestOptions: { fetchImpl: fetchReturning(mojangHtml) },
    })) as App[];

    expect(requested).toEqual(plain.map((item) => item.appId));
    expect(apps.every((item) => item.description.startsWith('detail '))).toBe(true);
  });
});
