import * as z from 'zod/mini';
import {
  age as ageConstants,
  category as categoryConstants,
  collection as collectionConstants,
} from '../../constants.ts';
import { parseBatchResponse } from '../../core/batchexecute.ts';
import { clientFromOptions, type ResolveClient } from '../../core/http.ts';
import { baseOptionsSchema, parseOptions } from '../../core/options.ts';
import { getPath } from '../../core/path.ts';
import { parseRaw } from '../../core/raw.ts';
import { resolveFullDetail, type GetApp } from '../../core/fullDetail.ts';
import { extract } from '../../core/spec.ts';
import { app } from '../app/app.ts';
import type { App } from '../app/schema.ts';
import { listItemSchema, type ListItem } from './schema.ts';
import {
  APPS_PATH,
  buildListBody,
  CLUSTER_NAMES,
  listItemSpecs,
  LIST_RPC_ID,
  listResponseSchema,
  listUrl,
} from './specs.ts';

export const listOptionsSchema = z.extend(baseOptionsSchema, {
  collection: z._default(z.enum(collectionConstants), 'TOP_FREE'),
  category: z._default(z.enum(categoryConstants), 'APPLICATION'),
  age: z.optional(z.enum(ageConstants)),
  num: z._default(z.int().check(z.gte(1)), 500),
  fullDetail: z._default(z.boolean(), false),
});

export type ListOptions = z.input<typeof listOptionsSchema>;

const LIST_CONTEXT = 'list';

export function createList(getApp: GetApp<App>, resolveClient: ResolveClient = clientFromOptions) {
  return async function list(options: ListOptions): Promise<ListItem[] | App[]> {
    const parsed = parseOptions(listOptionsSchema, options, LIST_CONTEXT);

    const client = resolveClient(parsed);
    const body = buildListBody({
      num: parsed.num.toString(),
      collection: CLUSTER_NAMES[parsed.collection],
      category: parsed.category,
    });

    const text = await client.request({
      url: listUrl(parsed.lang, parsed.country, parsed.age),
      method: 'POST',
      body,
    });

    const payload = parseBatchResponse(text, LIST_RPC_ID);
    parseRaw(listResponseSchema, payload, `${LIST_CONTEXT} response`);
    const appsData = getPath(payload, APPS_PATH);
    const items = Array.isArray(appsData)
      ? appsData.map((item) => extract(item, listItemSpecs, LIST_CONTEXT))
      : [];

    if (parsed.fullDetail) {
      return resolveFullDetail(items, parsed, getApp);
    }

    return z.array(listItemSchema).parse(items);
  };
}

export const list = createList(app);
