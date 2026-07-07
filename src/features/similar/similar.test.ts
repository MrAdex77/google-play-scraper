import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSimilar, similar, type SimilarOptions } from './similar.js';
import { similarAppSchema, type SimilarApp } from './schema.js';
import { findSimilarClusterPath } from './specs.js';
import { parseScriptData } from '../../core/scriptData.js';
import type { App } from '../app/schema.js';
import { ValidationError } from '../../core/errors.js';

const SOURCE_APP_ID = 'com.google.android.apps.translate';

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/similar/${name}`, import.meta.url)),
    'utf8',
  );

const detailsHtml = readFixture('translate-details.html');
const clusterHtml = readFixture('translate-cluster.html');

const sequenceFetch = (bodies: string[]): { fetchImpl: typeof fetch; count: () => number } => {
  let index = 0;
  const impl: typeof fetch = () => {
    const body = bodies[Math.min(index, bodies.length - 1)] ?? '';
    index += 1;
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl: impl, count: () => index };
};

const emptyClusterBatch = (): string => {
  const clusterNode: unknown[] = [];
  clusterNode[0] = [];
  clusterNode[7] = [null, null];
  const payload = [[clusterNode]];
  const frame = [['wrb.fr', 'qnKhOb', JSON.stringify(payload), null, null, null, 'generic']];
  const json = JSON.stringify(frame);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
};

const noClusterDetails =
  "<script>AF_initDataCallback({key: 'ds:5', hash: '1', data:[[]], sideChannel: {}});</script>";

describe('similar cluster discovery', () => {
  it('locates a similar cluster path inside the details fixture', () => {
    const path = findSimilarClusterPath(parseScriptData(detailsHtml));
    expect(typeof path).toBe('string');
    expect((path ?? '').length).toBeGreaterThan(0);
  });
});

describe('similar fixture parsing', () => {
  it('parses at least five validated apps from the cluster fixture', async () => {
    const { fetchImpl } = sequenceFetch([detailsHtml, clusterHtml, emptyClusterBatch()]);

    const items = (await similar({
      appId: SOURCE_APP_ID,
      requestOptions: { fetchImpl },
    })) as SimilarApp[];

    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const item of items) {
      expect(() => similarAppSchema.parse(item)).not.toThrow();
      expect(item.url.startsWith('https://play.google.com')).toBe(true);
    }
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);
  });

  it('never returns the source app among the similar results', async () => {
    const { fetchImpl } = sequenceFetch([detailsHtml, clusterHtml, emptyClusterBatch()]);

    const items = (await similar({
      appId: SOURCE_APP_ID,
      requestOptions: { fetchImpl },
    })) as SimilarApp[];

    expect(items.some((item) => item.appId === SOURCE_APP_ID)).toBe(false);
  });

  it('returns an empty list when the details page has no similar cluster', async () => {
    const { fetchImpl, count } = sequenceFetch([noClusterDetails]);

    const items = (await similar({
      appId: SOURCE_APP_ID,
      requestOptions: { fetchImpl },
    })) as SimilarApp[];

    expect(items).toEqual([]);
    expect(count()).toBe(1);
  });
});

describe('similar options', () => {
  it('rejects a missing appId through validation', async () => {
    await expect(similar({} as SimilarOptions)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('similar fullDetail', () => {
  it('resolves each app through the injected getApp exactly once', async () => {
    const plain = (await similar({
      appId: SOURCE_APP_ID,
      requestOptions: {
        fetchImpl: sequenceFetch([detailsHtml, clusterHtml, emptyClusterBatch()]).fetchImpl,
      },
    })) as SimilarApp[];

    const requested: string[] = [];
    const detailed = createSimilar((params) => {
      requested.push(params.appId);
      return Promise.resolve({ appId: params.appId, description: `detail ${params.appId}` } as App);
    });

    const apps = (await detailed({
      appId: SOURCE_APP_ID,
      fullDetail: true,
      requestOptions: {
        fetchImpl: sequenceFetch([detailsHtml, clusterHtml, emptyClusterBatch()]).fetchImpl,
      },
    })) as App[];

    expect(requested).toEqual(plain.map((item) => item.appId));
    expect(apps.every((item) => item.description.startsWith('detail '))).toBe(true);
  });
});
