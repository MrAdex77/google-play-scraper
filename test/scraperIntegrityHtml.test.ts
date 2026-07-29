import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { app } from '../src/features/app/app.js';
import { APP_DETAILS_RPC_ID, appScriptDataSelection, appSpecs } from '../src/features/app/specs.js';
import { dataSafety } from '../src/features/datasafety/datasafety.js';
import { search } from '../src/features/search/search.js';
import { ParseError, SpecError } from '../src/core/errors.js';
import type { IntegrityEvent } from '../src/core/integrity.js';
import { getPath, type Path } from '../src/core/path.js';
import { parseScriptData } from '../src/core/scriptData.js';
import {
  changeRoutingTableEntry,
  corruptScriptBlockData,
  deletePath,
  movePath,
  removeScriptBlock,
  renameAfInitDataCallbackKey,
  reorderRoutingTableEntries,
  replaceScriptBlockData,
} from './helpers/responseMutation.js';

const APP_ID = 'com.google.android.apps.translate';
const SYNTHETIC_KEY = 'ds:50';

const readFixture = (path: string): string =>
  readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');

const appHtml = readFixture('app/translate.html');
const minecraftHtml = readFixture('app/minecraft.html');
const searchHtml = readFixture('search/panda.html');
const dataSafetyHtml = readFixture('datasafety/translate.html');

const fetchReturning =
  (body: string): typeof fetch =>
  () =>
    Promise.resolve(new Response(body, { status: 200 }));

async function caughtError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected promise to reject');
}

function appDetails(html = appHtml): unknown {
  const details = parseScriptData(html).blocks['ds:5'];
  if (details === undefined) {
    throw new Error('app details fixture block missing');
  }
  return details;
}

function existingPath(root: unknown, paths: readonly Path[]): Path {
  const path = paths.find((candidate) => {
    const value = getPath(root, candidate);
    return value !== undefined && value !== null;
  });
  if (path === undefined) {
    throw new Error('fixture source path missing');
  }
  return path;
}

function appWithHtml(html: string, onIntegrityEvent?: (event: IntegrityEvent) => void) {
  return app({
    appId: APP_ID,
    onIntegrityEvent,
    requestOptions: { fetchImpl: fetchReturning(html) },
  });
}

async function expectAppSpecFailure(
  html: string,
  fields: readonly (keyof typeof appSpecs)[],
): Promise<void> {
  const events: IntegrityEvent[] = [];
  const error = await caughtError(appWithHtml(html, (event) => events.push(event)));

  expect(error).toBeInstanceOf(SpecError);
  const specError = error as SpecError;
  expect(specError.context).toBe('app');
  for (const field of fields) {
    const failure = specError.failures.find((candidate) => candidate.field === field);
    expect(failure).toBeDefined();
    expect(failure?.paths).toEqual(appSpecs[field].paths);
    expect(failure?.message).toContain('required value missing');
  }
  expect(events).toEqual([]);
}

describe('response mutation helpers', () => {
  it('deeply moves values without changing the source', () => {
    const source = { nested: { first: ['value'], second: [] as string[] } };
    const moved = movePath(source, ['nested', 'first', 0], ['nested', 'second', 0]);

    expect(source).toEqual({ nested: { first: ['value'], second: [] } });
    expect(moved).toEqual({ nested: { first: [undefined], second: ['value'] } });
  });

  it('throws when a mutation source path or response marker is misspelled', () => {
    expect(() => deletePath({ present: true }, ['missing'])).toThrow(
      'mutation source path missing: missing',
    );
    expect(() => renameAfInitDataCallbackKey(appHtml, 'ds:404', SYNTHETIC_KEY)).toThrow(
      'script block missing: ds:404',
    );
    expect(() => changeRoutingTableEntry(appHtml, 'ds:404', { rpcId: 'other' })).toThrow(
      'service request entry missing: ds:404',
    );
    expect(() => reorderRoutingTableEntries(appHtml, ['ds:404', 'ds:5'])).toThrow(
      'routing reorder keys must exist exactly once',
    );
  });
});

describe('app field mutations', () => {
  it('rejects missing price and free sources without plausible defaults', async () => {
    const details = deletePath(appDetails(), appSpecs.price.paths[0] ?? []);
    await expectAppSpecFailure(replaceScriptBlockData(appHtml, 'ds:5', details), ['price', 'free']);
  });

  it('rejects a missing availability source without false defaults', async () => {
    const details = deletePath(appDetails(), appSpecs.available.paths[0] ?? []);
    await expectAppSpecFailure(replaceScriptBlockData(appHtml, 'ds:5', details), [
      'available',
      'preregister',
    ]);
  });

  it('rejects a missing histogram source without an empty aggregate', async () => {
    const details = deletePath(appDetails(), appSpecs.histogram.paths[0] ?? []);
    await expectAppSpecFailure(replaceScriptBlockData(appHtml, 'ds:5', details), ['histogram']);
  });

  it('preserves optional and documented default behavior only', async () => {
    const details = appDetails(minecraftHtml);
    const withoutScore = deletePath(details, existingPath(details, appSpecs.score.paths));
    const withoutVersion = deletePath(
      withoutScore,
      existingPath(withoutScore, appSpecs.version.paths),
    );
    const result = await appWithHtml(replaceScriptBlockData(minecraftHtml, 'ds:5', withoutVersion));

    expect(result.score).toBeUndefined();
    expect(result.version).toBe('VARY');
  });
});

describe('selected script block mutations', () => {
  it('declares both app comment fallbacks and the details rpc id', () => {
    expect(appScriptDataSelection.blockKeys).toEqual(new Set(['ds:5', 'ds:8', 'ds:9']));
    expect(appScriptDataSelection.rpcIds).toEqual(new Set([APP_DETAILS_RPC_ID]));
  });

  it('rejects malformed json in a selected block', async () => {
    const error = await caughtError(appWithHtml(corruptScriptBlockData(appHtml, 'ds:5')));

    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toBe('script data block ds:5: invalid JSON');
  });

  it('ignores malformed json in an unselected block without changing the result', async () => {
    const baseline = await appWithHtml(appHtml);
    const events: IntegrityEvent[] = [];
    const result = await appWithHtml(corruptScriptBlockData(appHtml, 'ds:0'), (event) =>
      events.push(event),
    );

    expect(result).toEqual(baseline);
    expect(events).toEqual([]);
  });
});

describe('rpc routing mutations', () => {
  it('follows app details moved to a synthetic routed key', async () => {
    const baseline = await appWithHtml(appHtml);
    const renamed = renameAfInitDataCallbackKey(appHtml, 'ds:5', SYNTHETIC_KEY);
    const routed = changeRoutingTableEntry(renamed, 'ds:5', { key: SYNTHETIC_KEY });
    const events: IntegrityEvent[] = [];

    const result = await appWithHtml(routed, (event) => events.push(event));

    expect(result).toEqual(baseline);
    expect(events).toEqual([]);
  });

  it('follows search results moved to a synthetic routed key', async () => {
    const baseline = await search({
      term: 'panda',
      num: 1,
      requestOptions: { fetchImpl: fetchReturning(searchHtml) },
    });
    const renamed = renameAfInitDataCallbackKey(searchHtml, 'ds:4', SYNTHETIC_KEY);
    const routed = changeRoutingTableEntry(renamed, 'ds:4', { key: SYNTHETIC_KEY });
    const events: IntegrityEvent[] = [];

    const result = await search({
      term: 'panda',
      num: 1,
      onIntegrityEvent: (event) => events.push(event),
      requestOptions: { fetchImpl: fetchReturning(routed) },
    });

    expect(result).toEqual(baseline);
    expect(events).toEqual([]);
  });

  it('follows Data Safety moved to a synthetic routed key', async () => {
    const baseline = await dataSafety({
      appId: APP_ID,
      requestOptions: { fetchImpl: fetchReturning(dataSafetyHtml) },
    });
    const renamed = renameAfInitDataCallbackKey(dataSafetyHtml, 'ds:3', SYNTHETIC_KEY);
    const routed = changeRoutingTableEntry(renamed, 'ds:3', { key: SYNTHETIC_KEY });
    const events: IntegrityEvent[] = [];

    const result = await dataSafety({
      appId: APP_ID,
      onIntegrityEvent: (event) => events.push(event),
      requestOptions: { fetchImpl: fetchReturning(routed) },
    });

    expect(result).toEqual(baseline);
    expect(events).toEqual([]);
  });

  it('uses the app absolute fallback after only its route is removed', async () => {
    const rerouted = changeRoutingTableEntry(appHtml, 'ds:5', { rpcId: 'unrelatedRpc' });
    const events: IntegrityEvent[] = [];

    const result = await appWithHtml(rerouted, (event) => events.push(event));

    expect(result.title).toContain('Translate');
    expect(events).toHaveLength(1);
    expect(events[0]?.context).toBe('app details');
    expect(events[0]?.reason).toBe('rpc-anchor-fallback');
    expect(events[0]?.error.message).toContain('Ws7gDc');
    expect(events[0]?.error.message).toContain('ds:5');
  });

  it('selects app roots independently of routing-table order', async () => {
    const baseline = await appWithHtml(appHtml);
    const reordered = reorderRoutingTableEntries(appHtml, ['ds:9', 'ds:5']);
    const events: IntegrityEvent[] = [];

    const result = await appWithHtml(reordered, (event) => events.push(event));

    expect(result).toEqual(baseline);
    expect(events).toEqual([]);
  });

  it('rejects two structurally valid app details candidates as ambiguous', async () => {
    const ambiguous = replaceScriptBlockData(appHtml, 'ds:9', appDetails());
    const error = await caughtError(appWithHtml(ambiguous));

    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain('app details');
    expect((error as Error).message).toContain('Ws7gDc');
    expect((error as Error).message).toContain('ds:5');
    expect((error as Error).message).toContain('ds:9');
  });

  it('rejects missing routed and fallback app details roots', async () => {
    const withoutPrimaryRoute = changeRoutingTableEntry(appHtml, 'ds:5', {
      rpcId: 'unrelatedRpc',
    });
    const withoutRoutes = changeRoutingTableEntry(withoutPrimaryRoute, 'ds:9', {
      rpcId: 'unrelatedRpc',
    });
    const withoutRoot = removeScriptBlock(withoutRoutes, 'ds:5');
    const error = await caughtError(appWithHtml(withoutRoot));

    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain('app details');
    expect((error as Error).message).toContain('required script root missing');
  });

  it('rejects missing routed and fallback search roots', async () => {
    const withoutRoute = changeRoutingTableEntry(searchHtml, 'ds:4', {
      rpcId: 'unrelatedRpc',
    });
    const withoutRoot = removeScriptBlock(withoutRoute, 'ds:4');
    const error = await caughtError(
      search({
        term: 'panda',
        requestOptions: { fetchImpl: fetchReturning(withoutRoot) },
      }),
    );

    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain('search root');
    expect((error as Error).message).toContain('required script root missing');
  });

  it('rejects missing routed and fallback Data Safety roots', async () => {
    const withoutRoute = changeRoutingTableEntry(dataSafetyHtml, 'ds:3', {
      rpcId: 'unrelatedRpc',
    });
    const withoutRoot = removeScriptBlock(withoutRoute, 'ds:3');
    const error = await caughtError(
      dataSafety({
        appId: APP_ID,
        requestOptions: { fetchImpl: fetchReturning(withoutRoot) },
      }),
    );

    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain('dataSafety root');
    expect((error as Error).message).toContain('required script root missing');
  });
});
