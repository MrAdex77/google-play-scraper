import { z } from 'zod';
import {
  age as ageConstants,
  category as categoryConstants,
  collection as collectionConstants,
} from '../../constants.js';
import { parseBatchResponse } from '../../core/batchexecute.js';
import { clientFromOptions } from '../../core/http.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { getPath } from '../../core/path.js';
import { resolveFullDetail, type GetApp } from '../../core/fullDetail.js';
import { extract } from '../../core/spec.js';
import { app } from '../app/app.js';
import type { App } from '../app/schema.js';
import { listItemSchema, type ListItem } from './schema.js';
import {
  APPS_PATH,
  buildListBody,
  CLUSTER_NAMES,
  listItemSpecs,
  LIST_RPC_ID,
  listUrl,
} from './specs.js';

export const listOptionsSchema = baseOptionsSchema.extend({
  collection: z.enum(collectionConstants).default('TOP_FREE'),
  category: z.enum(categoryConstants).default('APPLICATION'),
  age: z.enum(ageConstants).optional(),
  num: z.number().int().min(1).default(500),
  fullDetail: z.boolean().default(false),
});

export type ListOptions = z.input<typeof listOptionsSchema>;

const LIST_CONTEXT = 'list';

export function createList(getApp: GetApp<App>) {
  return async function list(options: ListOptions): Promise<ListItem[] | App[]> {
    const parsed = parseOptions(listOptionsSchema, options, LIST_CONTEXT);

    const client = clientFromOptions(parsed);
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
