import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createList, list, type ListOptions } from './list.js';
import { listItemSchema, type ListItem } from './schema.js';
import { buildListBody, CLUSTER_NAMES } from './specs.js';
import type { App } from '../app/schema.js';
import { ValidationError } from '../../core/errors.js';

const topFreeGame = readFileSync(
  fileURLToPath(new URL('../../../test/fixtures/list/topfree-game.txt', import.meta.url)),
  'utf8',
);

const fetchReturning = (body: string, status = 200): typeof fetch => {
  const impl: typeof fetch = () => Promise.resolve(new Response(body, { status }));
  return impl;
};

const recordingFetch = (body: string): { fetchImpl: typeof fetch; bodies: string[] } => {
  const bodies: string[] = [];
  const fetchImpl: typeof fetch = (_input, init) => {
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl, bodies };
};

describe('list fixture parsing', () => {
  it('decodes the recorded collection into at least fifty validated apps', async () => {
    const items = (await list({
      collection: 'TOP_FREE',
      category: 'GAME',
      num: 100,
      requestOptions: { fetchImpl: fetchReturning(topFreeGame) },
    })) as ListItem[];

    expect(items.length).toBeGreaterThanOrEqual(50);
    for (const item of items) {
      expect(() => listItemSchema.parse(item)).not.toThrow();
      expect(item.url.startsWith('https://play.google.com')).toBe(true);
    }
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);
    expect(items.some((item) => item.free && item.price === 0)).toBe(true);
  });
});

describe('buildListBody interpolation', () => {
  it('places num, collection and category into the encoded template', () => {
    const body = buildListBody({
      num: '100',
      collection: CLUSTER_NAMES.TOP_FREE,
      category: 'GAME',
    });

    expect(body.startsWith('f.req=')).toBe(true);
    expect(body).toContain('&at=');

    const numOffset = body.indexOf('%5B20%2C100%5D');
    const collectionOffset = body.indexOf('%5C%22topselling_free%5C%22');
    const categoryOffset = body.indexOf('%5C%22GAME%5C%22');

    expect(numOffset).toBeGreaterThan(-1);
    expect(collectionOffset).toBeGreaterThan(-1);
    expect(categoryOffset).toBeGreaterThan(-1);
    expect(numOffset).toBeLessThan(collectionOffset);
    expect(collectionOffset).toBeLessThan(categoryOffset);
  });

  it('posts the built body verbatim to the batch endpoint', async () => {
    const { fetchImpl, bodies } = recordingFetch(topFreeGame);

    await list({
      collection: 'GROSSING',
      category: 'SOCIAL',
      num: 25,
      requestOptions: { fetchImpl },
    });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain('%5B20%2C25%5D');
    expect(bodies[0]).toContain('%5C%22topgrossing%5C%22');
    expect(bodies[0]).toContain('%5C%22SOCIAL%5C%22');
  });
});

describe('list option validation', () => {
  it('rejects an invalid collection naming the field', async () => {
    const error = await list({ collection: 'NOPE' } as unknown as ListOptions).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toContain('collection');
  });

  it('rejects an invalid category naming the field', async () => {
    const error = await list({ category: 'NOPE' } as unknown as ListOptions).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toContain('category');
  });

  it('accepts each valid age range and rejects others', async () => {
    for (const age of ['AGE_RANGE1', 'AGE_RANGE2', 'AGE_RANGE3'] as const) {
      const items = await list({
        age,
        num: 5,
        requestOptions: { fetchImpl: fetchReturning(topFreeGame) },
      });
      expect(Array.isArray(items)).toBe(true);
    }

    await expect(list({ age: 'AGE_RANGE9' } as unknown as ListOptions)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('list fullDetail', () => {
  it('resolves each item through the injected getApp exactly once', async () => {
    const plain = (await list({
      collection: 'TOP_FREE',
      category: 'GAME',
      num: 100,
      requestOptions: { fetchImpl: fetchReturning(topFreeGame) },
    })) as ListItem[];

    const requested: string[] = [];
    const listWithStub = createList((params) => {
      requested.push(params.appId);
      return Promise.resolve({ appId: params.appId, description: `detail ${params.appId}` } as App);
    });

    const detailed = (await listWithStub({
      collection: 'TOP_FREE',
      category: 'GAME',
      num: 100,
      fullDetail: true,
      requestOptions: { fetchImpl: fetchReturning(topFreeGame) },
    })) as App[];

    expect(requested).toEqual(plain.map((item) => item.appId));
    expect(detailed).toHaveLength(plain.length);
    expect(detailed.every((item) => item.description.startsWith('detail '))).toBe(true);
  });
});
