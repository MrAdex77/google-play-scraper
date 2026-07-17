import * as z from 'zod/mini';
import { clientFromOptions, type HttpClient, type ResolveClient } from '../../core/http.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { getPath } from '../../core/path.js';
import { clusterItemSpecs } from '../../core/clusterItem.js';
import { fetchClusterApps } from '../../core/pagination.js';
import { resolveFullDetail, type GetApp } from '../../core/fullDetail.js';
import { parseScriptData } from '../../core/scriptData.js';
import { extract, type Extracted } from '../../core/spec.js';
import { app } from '../app/app.js';
import type { App } from '../app/schema.js';
import { developerAppSchema, type DeveloperApp } from './schema.js';
import {
  CLUSTER_MAPPINGS,
  developerUrl,
  isNumericDevId,
  NAME_INITIAL_MAPPINGS,
  nameItemSpecs,
  NUMERIC_INITIAL_MAPPINGS,
  numericItemSpecs,
} from './specs.js';

export const developerOptionsSchema = z.extend(baseOptionsSchema, {
  devId: z.string().check(z.minLength(1)),
  num: z._default(z.int().check(z.gte(1)), 60),
  fullDetail: z._default(z.boolean(), false),
});

export type DeveloperOptions = z.input<typeof developerOptionsSchema>;

type ParsedDeveloperOptions = z.infer<typeof developerOptionsSchema>;

export const DEVELOPER_CONTEXT = 'developer';

type DeveloperItem = Extracted<typeof numericItemSpecs>;

export type DeveloperQuery = Pick<
  ParsedDeveloperOptions,
  'devId' | 'lang' | 'country' | 'throttle' | 'requestOptions'
>;

export interface DeveloperFirstPage {
  client: HttpClient;
  apps: DeveloperItem[];
  token: string | undefined;
}

interface DeveloperLayout {
  mappings: typeof NUMERIC_INITIAL_MAPPINGS;
  itemSpecs: typeof numericItemSpecs;
}

const NUMERIC_LAYOUT: DeveloperLayout = {
  mappings: NUMERIC_INITIAL_MAPPINGS,
  itemSpecs: numericItemSpecs,
};

const NAME_LAYOUT: DeveloperLayout = {
  mappings: NAME_INITIAL_MAPPINGS,
  itemSpecs: nameItemSpecs,
};

function extractLayout(
  blocks: Record<string, unknown>,
  layout: DeveloperLayout,
): { apps: DeveloperItem[]; token: string | undefined } | undefined {
  const appsData = getPath(blocks, layout.mappings.apps);
  if (!Array.isArray(appsData) || appsData.length === 0) {
    return undefined;
  }
  const apps = appsData.map((item) => extract(item, layout.itemSpecs, DEVELOPER_CONTEXT));
  const token = getPath(blocks, layout.mappings.token);
  return { apps, token: typeof token === 'string' ? token : undefined };
}

function extractInitial(
  blocks: Record<string, unknown>,
  numeric: boolean,
): { apps: DeveloperItem[]; token: string | undefined } {
  const ordered = numeric ? [NUMERIC_LAYOUT, NAME_LAYOUT] : [NAME_LAYOUT, NUMERIC_LAYOUT];
  for (const layout of ordered) {
    const extracted = extractLayout(blocks, layout);
    if (extracted !== undefined) {
      return extracted;
    }
  }
  return { apps: [], token: undefined };
}

export async function fetchDeveloperFirstPage(
  query: DeveloperQuery,
  resolveClient: ResolveClient,
): Promise<DeveloperFirstPage> {
  const numeric = isNumericDevId(query.devId);
  const client = resolveClient(query);
  const html = await client.request({
    url: developerUrl(query.devId, query.lang, query.country),
  });
  const data = parseScriptData(html);
  const initial = extractInitial(data.blocks, numeric);
  return { client, apps: initial.apps, token: initial.token };
}

export function createDeveloper(
  getApp: GetApp<App>,
  resolveClient: ResolveClient = clientFromOptions,
) {
  return async function developer(options: DeveloperOptions): Promise<DeveloperApp[] | App[]> {
    const parsed = parseOptions(developerOptionsSchema, options, DEVELOPER_CONTEXT);
    const { client, apps, token } = await fetchDeveloperFirstPage(parsed, resolveClient);

    const items = await fetchClusterApps({
      client,
      lang: parsed.lang,
      country: parsed.country,
      num: parsed.num,
      initialApps: apps,
      initialToken: token,
      itemSpecs: clusterItemSpecs,
      appsPath: CLUSTER_MAPPINGS.apps,
      tokenPath: CLUSTER_MAPPINGS.token,
      context: DEVELOPER_CONTEXT,
      onDegradation: parsed.onDegradation,
    });

    const sliced = items.slice(0, parsed.num);

    if (parsed.fullDetail) {
      return resolveFullDetail(sliced, parsed, getApp);
    }

    return z.array(developerAppSchema).parse(sliced);
  };
}

export const developer = createDeveloper(app);
