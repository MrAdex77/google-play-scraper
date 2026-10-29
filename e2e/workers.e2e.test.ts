import type { Miniflare } from 'miniflare';
import * as z from 'zod/mini';
import { safeParse, type $ZodType } from 'zod/v4/core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  appItemSchema,
  appSchema,
  dataSafetySchema,
  permissionSchema,
  reviewsResultSchema,
} from '../src/index.ts';
import {
  COMPATIBILITY_DATES,
  SOURCE_ENTRY,
  bundleProbe,
  runInWorker,
  startProbe,
} from '../workers/runtime.ts';
import type { ScenarioName } from '../workers/scenarios.ts';
import { liveDescribe } from './helpers.ts';

const nonEmpty = <Item extends $ZodType>(item: Item) => z.array(item).check(z.minLength(1));

const LIVE_CONTRACTS: readonly (readonly [ScenarioName, $ZodType])[] = [
  ['app', z.object({ ...appSchema.shape, appId: z.literal('com.whatsapp') })],
  ['search', nonEmpty(appItemSchema)],
  ['suggest', nonEmpty(z.string())],
  ['reviews', z.object({ ...reviewsResultSchema.shape, data: nonEmpty(z.unknown()) })],
  ['permissions', nonEmpty(permissionSchema)],
  ['dataSafety', dataSafetySchema],
];

liveDescribe('library inside workerd against live Google Play', () => {
  let worker: Miniflare;

  beforeAll(async () => {
    worker = startProbe(await bundleProbe(SOURCE_ENTRY), COMPATIBILITY_DATES.current);
  });

  afterAll(async () => {
    await worker.dispose();
  });

  it.each(LIVE_CONTRACTS)('%s returns a schema valid result', async (name, schema) => {
    const outcome = await runInWorker(worker, name);

    const parsed = safeParse(z.object({ value: schema }), outcome);

    expect(parsed.error?.issues ?? [], JSON.stringify(outcome).slice(0, 500)).toEqual([]);
  });
});
