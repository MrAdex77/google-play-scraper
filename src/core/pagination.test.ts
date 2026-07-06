import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildClusterBody, clusterUrl, CLUSTER_PAGE_SIZE, fetchClusterApps } from './pagination.js';
import { BATCH_URL } from './batchexecute.js';
import type { HttpClient, HttpRequest } from './http.js';
import type { SpecMap } from './spec.js';

const itemSpecs = {
  id: { paths: [[0]], schema: z.string() },
} satisfies SpecMap;

const APPS_PATH = [0, 0, 0];
const TOKEN_PATH = [0, 0, 7, 1];

const batchResponse = (apps: unknown[], token: string | null): string => {
  const inner: unknown[] = [];
  inner[0] = apps;
  inner[7] = [null, token];
  const payload = [[inner]];
  const frame = [['wrb.fr', 'qnKhOb', JSON.stringify(payload), null, null, null, 'generic']];
  return `)]}'\n\n${JSON.stringify(frame).length.toString()}\n${JSON.stringify(frame)}`;
};

const queuedClient = (responses: string[]): { client: HttpClient; requests: HttpRequest[] } => {
  const requests: HttpRequest[] = [];
  let index = 0;
  const client: HttpClient = {
    request(req) {
      requests.push(req);
      const body = responses[index] ?? batchResponse([], null);
      index += 1;
      return Promise.resolve(body);
    },
  };
  return { client, requests };
};

describe('clusterUrl', () => {
  it('embeds the rpc id, language and country in the batch url', () => {
    const url = clusterUrl('pl', 'de');
    expect(url.startsWith(`${BATCH_URL}?`)).toBe(true);
    expect(url).toContain('rpcids=qnKhOb');
    expect(url).toContain('hl=pl');
    expect(url).toContain('gl=de');
  });
});

describe('buildClusterBody', () => {
  it('interpolates the page size and pagination token verbatim', () => {
    const body = buildClusterBody(CLUSTER_PAGE_SIZE, 'TOKEN123');
    expect(body).toContain(`%2C${CLUSTER_PAGE_SIZE.toString()}%5D%5D`);
    expect(body).toContain('%5C%22TOKEN123%5C%22');
    expect(body.startsWith('f.req=')).toBe(true);
  });
});

describe('fetchClusterApps', () => {
  it('follows the pagination token across pages until it runs out', async () => {
    const { client, requests } = queuedClient([
      batchResponse([['a'], ['b']], 't2'),
      batchResponse([['c'], ['d']], null),
    ]);

    const result = await fetchClusterApps({
      client,
      lang: 'en',
      country: 'us',
      num: 10,
      initialApps: [],
      initialToken: 't1',
      itemSpecs,
      appsPath: APPS_PATH,
      tokenPath: TOKEN_PATH,
      context: 'test',
    });

    expect(result.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.method).toBe('POST');
  });

  it('never returns more than num and stops requesting once satisfied', async () => {
    const { client, requests } = queuedClient([
      batchResponse([['a'], ['b']], 't2'),
      batchResponse([['c'], ['d']], 't3'),
    ]);

    const result = await fetchClusterApps({
      client,
      lang: 'en',
      country: 'us',
      num: 3,
      initialApps: [],
      initialToken: 't1',
      itemSpecs,
      appsPath: APPS_PATH,
      tokenPath: TOKEN_PATH,
      context: 'test',
    });

    expect(result).toHaveLength(3);
    expect(requests).toHaveLength(2);
  });

  it('treats an empty apps page as the end of pagination', async () => {
    const { client, requests } = queuedClient([batchResponse([], 'still-a-token')]);

    const result = await fetchClusterApps({
      client,
      lang: 'en',
      country: 'us',
      num: 10,
      initialApps: [{ id: 'seed' }],
      initialToken: 't1',
      itemSpecs,
      appsPath: APPS_PATH,
      tokenPath: TOKEN_PATH,
      context: 'test',
    });

    expect(result).toEqual([{ id: 'seed' }]);
    expect(requests).toHaveLength(1);
  });

  it('does not request anything when no initial token exists', async () => {
    const { client, requests } = queuedClient([]);

    const result = await fetchClusterApps({
      client,
      lang: 'en',
      country: 'us',
      num: 10,
      initialApps: [{ id: 'seed' }],
      initialToken: undefined,
      itemSpecs,
      appsPath: APPS_PATH,
      tokenPath: TOKEN_PATH,
      context: 'test',
    });

    expect(result).toEqual([{ id: 'seed' }]);
    expect(requests).toHaveLength(0);
  });
});
