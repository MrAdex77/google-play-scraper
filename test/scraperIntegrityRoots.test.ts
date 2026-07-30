import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { permission } from '../src/constants.js';
import { parseBatchResponse } from '../src/core/batchexecute.js';
import type { DegradationEvent } from '../src/core/degradation.js';
import { ParseError } from '../src/core/errors.js';
import type { HttpClient } from '../src/core/http.js';
import { getPath } from '../src/core/path.js';
import { clusterPages } from '../src/core/pagination.js';
import { parseRaw } from '../src/core/raw.js';
import { parseScriptData } from '../src/core/scriptData.js';
import { required, type SpecMap } from '../src/core/spec.js';
import { APPS_PATH, LIST_RPC_ID, listResponseSchema } from '../src/features/list/specs.js';
import {
  commonPermissionsResponseSchema,
  otherPermissionsResponseSchema,
  PERMISSIONS_RPC_ID,
} from '../src/features/permissions/specs.js';
import {
  REVIEWS_RESPONSE_PATHS,
  REVIEWS_RPC_ID,
  reviewsCollectionResponseSchema,
} from '../src/features/reviews/specs.js';
import {
  CLUSTER_PAGE_MAPPINGS,
  similarClusterPageRootSpec,
} from '../src/features/similar/specs.js';
import {
  SUGGESTIONS_PATH,
  SUGGEST_RPC_ID,
  suggestResponseSchema,
} from '../src/features/suggest/specs.js';
import {
  NUMERIC_INITIAL_MAPPINGS,
  numericInitialRootSpec,
} from '../src/features/developer/specs.js';
import { deletePath, movePath } from './helpers/responseMutation.js';

const readFixture = (path: string): string =>
  readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');

function expectRawFailure(schema: Parameters<typeof parseRaw>[0], value: unknown, context: string) {
  let thrown: unknown;
  try {
    parseRaw(schema, value, context);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(ParseError);
  expect((thrown as Error).message).toContain(context);
}

describe('batchexecute response root mutations', () => {
  it('rejects a deleted list apps root', () => {
    const payload = parseBatchResponse(readFixture('list/topfree-game.txt'), LIST_RPC_ID);
    const mutated = deletePath(payload, APPS_PATH);

    expectRawFailure(listResponseSchema, mutated, 'list response');
  });

  it('rejects a deleted reviews collection root', () => {
    const payload = parseBatchResponse(
      readFixture('reviews/translate-initial.txt'),
      REVIEWS_RPC_ID,
    );
    const mutated = deletePath(payload, REVIEWS_RESPONSE_PATHS.reviews);

    expectRawFailure(reviewsCollectionResponseSchema, mutated, 'reviews collection response');
  });

  it('accepts a deleted permissions section as an app without that section', () => {
    const payload = parseBatchResponse(
      readFixture('permissions/translate.txt'),
      PERMISSIONS_RPC_ID,
    );

    expect(
      parseRaw(
        commonPermissionsResponseSchema,
        deletePath(payload, [permission.COMMON]),
        'permissions common response',
      ),
    ).toBeDefined();
    expect(
      parseRaw(
        otherPermissionsResponseSchema,
        deletePath(payload, [permission.OTHER]),
        'permissions other response',
      ),
    ).toBeDefined();
  });

  it('rejects each permissions section replaced by a non-collection', () => {
    const payload = parseBatchResponse(
      readFixture('permissions/translate.txt'),
      PERMISSIONS_RPC_ID,
    );
    const withScalarSection = (index: number): unknown => {
      const mutated = structuredClone(payload) as unknown[];
      mutated[index] = 'not-a-section';
      return mutated;
    };

    expectRawFailure(
      commonPermissionsResponseSchema,
      withScalarSection(permission.COMMON),
      'permissions common response',
    );
    expectRawFailure(
      otherPermissionsResponseSchema,
      withScalarSection(permission.OTHER),
      'permissions other response',
    );
  });

  it('rejects a moved suggestion collection root', () => {
    const payload = parseBatchResponse(readFixture('suggest/pand.txt'), SUGGEST_RPC_ID);
    const mutated = movePath(payload, SUGGESTIONS_PATH, [0, 1]);

    expectRawFailure(suggestResponseSchema, mutated, 'suggest response');
  });

  it('reports a deleted cluster continuation apps root at the raw boundary', async () => {
    const inner: unknown[] = [];
    inner[7] = [null, 'next-token'];
    const payload = [[inner]];
    const frame = [['wrb.fr', 'qnKhOb', JSON.stringify(payload), null, null, null, 'generic']];
    const client: HttpClient = {
      request: () => Promise.resolve(`)]}'\n\n${JSON.stringify(frame)}`),
    };
    const itemSpecs = {
      id: { paths: [[0]], missing: required(), schema: z.string() },
    } satisfies SpecMap;
    const events: DegradationEvent[] = [];
    const pages: unknown[] = [];

    for await (const page of clusterPages({
      client,
      lang: 'en',
      country: 'us',
      initialApps: [],
      initialToken: 'first-token',
      itemSpecs,
      appsPath: [0, 0, 0],
      tokenPath: [0, 0, 7, 1],
      context: 'cluster mutation',
      onDegradation: (event) => events.push(event),
    })) {
      pages.push(page);
    }

    expect(pages).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe('cluster-page-parse');
    expect(events[0]?.error).toBeInstanceOf(ParseError);
    expect(events[0]?.error.message).toContain('cluster mutation continuation apps response');
  });
});

describe('html response root mutations', () => {
  it('rejects a deleted similar initial apps collection', () => {
    const data = parseScriptData(readFixture('similar/translate-cluster.html'));
    const root = data.blocks['ds:3'];
    if (root === undefined) {
      throw new Error('similar cluster fixture root missing');
    }
    const mutated = deletePath(root, CLUSTER_PAGE_MAPPINGS.apps);

    expectRawFailure(similarClusterPageRootSpec.schema, mutated, 'similar cluster page');
  });

  it('rejects a moved developer initial apps collection', () => {
    const data = parseScriptData(readFixture('developer/google.html'));
    const pageRoot = data.blocks['ds:3'];
    const absolutePath = numericInitialRootSpec.paths[0] ?? [];
    const layout = getPath(pageRoot, absolutePath.slice(1));
    if (layout === undefined) {
      throw new Error('developer fixture layout missing');
    }
    const mutated = movePath(layout, NUMERIC_INITIAL_MAPPINGS.apps, [2]);

    expectRawFailure(numericInitialRootSpec.schema, mutated, 'developer layout');
  });
});
