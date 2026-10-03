import * as z from 'zod/mini';
import { clientFromOptions, type HttpClient, type ResolveClient } from '../../core/http.ts';
import { baseOptionsSchema, parseOptions } from '../../core/options.ts';
import { getPath } from '../../core/path.ts';
import { clusterItemSpecs } from '../../core/clusterItem.ts';
import { fetchClusterApps, type ClusterPagesParams } from '../../core/pagination.ts';
import { resolveFullDetail, type GetApp } from '../../core/fullDetail.ts';
import { parseScriptData } from '../../core/scriptData.ts';
import { resolveScriptRoot, type ScriptRootSpec } from '../../core/scriptRoot.ts';
import { extract, type Extracted } from '../../core/spec.ts';
import { app } from '../app/app.ts';
import type { App } from '../app/schema.ts';
import { developerAppSchema, type DeveloperApp } from './schema.ts';
import {
  developerClusterLayouts,
  developerScriptDataSelection,
  developerUrl,
  isNumericDevId,
  NAME_INITIAL_MAPPINGS,
  nameInitialRootSpec,
  nameItemSpecs,
  NUMERIC_INITIAL_MAPPINGS,
  numericInitialRootSpec,
  numericItemSpecs,
} from './specs.ts';

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
  rootSpec: ScriptRootSpec;
  mappings: typeof NUMERIC_INITIAL_MAPPINGS;
  itemSpecs: typeof numericItemSpecs;
}

const NUMERIC_LAYOUT: DeveloperLayout = {
  rootSpec: numericInitialRootSpec,
  mappings: NUMERIC_INITIAL_MAPPINGS,
  itemSpecs: numericItemSpecs,
};

const NAME_LAYOUT: DeveloperLayout = {
  rootSpec: nameInitialRootSpec,
  mappings: NAME_INITIAL_MAPPINGS,
  itemSpecs: nameItemSpecs,
};

function extractLayout(
  data: ReturnType<typeof parseScriptData>,
  layout: DeveloperLayout,
): { apps: DeveloperItem[]; token: string | undefined } | undefined {
  const resolved = resolveScriptRoot(data, layout.rootSpec, `${DEVELOPER_CONTEXT} layout`);
  if (resolved.root === undefined) {
    return undefined;
  }
  const appsData = getPath(resolved.root, layout.mappings.apps);
  if (!Array.isArray(appsData) || appsData.length === 0) {
    return undefined;
  }
  const apps = appsData.map((item) => extract(item, layout.itemSpecs, DEVELOPER_CONTEXT));
  const token = getPath(resolved.root, layout.mappings.token);
  return { apps, token: typeof token === 'string' ? token : undefined };
}

function extractInitial(
  data: ReturnType<typeof parseScriptData>,
  numeric: boolean,
): { apps: DeveloperItem[]; token: string | undefined } {
  const ordered = numeric ? [NUMERIC_LAYOUT, NAME_LAYOUT] : [NAME_LAYOUT, NUMERIC_LAYOUT];
  for (const layout of ordered) {
    const extracted = extractLayout(data, layout);
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
  const data = parseScriptData(html, developerScriptDataSelection);
  const initial = extractInitial(data, numeric);
  return { client, apps: initial.apps, token: initial.token };
}

export function developerClusterParams(
  options: Pick<
    ParsedDeveloperOptions,
    'devId' | 'lang' | 'country' | 'onDegradation' | 'onIntegrityEvent'
  >,
  firstPage: DeveloperFirstPage,
): ClusterPagesParams<typeof clusterItemSpecs> {
  const { primary, fallback } = developerClusterLayouts(options.devId);
  return {
    client: firstPage.client,
    lang: options.lang,
    country: options.country,
    initialApps: firstPage.apps,
    initialToken: firstPage.token,
    itemSpecs: clusterItemSpecs,
    appsPath: primary.apps,
    tokenPath: primary.token,
    fallbackLayouts: [fallback],
    context: DEVELOPER_CONTEXT,
    onDegradation: options.onDegradation,
    onIntegrityEvent: options.onIntegrityEvent,
  };
}

export function createDeveloper(
  getApp: GetApp<App>,
  resolveClient: ResolveClient = clientFromOptions,
) {
  return async function developer(options: DeveloperOptions): Promise<DeveloperApp[] | App[]> {
    const parsed = parseOptions(developerOptionsSchema, options, DEVELOPER_CONTEXT);
    const firstPage = await fetchDeveloperFirstPage(parsed, resolveClient);

    const items = await fetchClusterApps({
      ...developerClusterParams(parsed, firstPage),
      num: parsed.num,
    });

    const sliced = items.slice(0, parsed.num);

    if (parsed.fullDetail) {
      return resolveFullDetail(sliced, parsed, getApp);
    }

    return z.array(developerAppSchema).parse(sliced);
  };
}

export const developer = createDeveloper(app);
