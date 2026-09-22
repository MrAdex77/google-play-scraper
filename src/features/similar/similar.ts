import * as z from 'zod/mini';
import { clientFromOptions, type HttpClient, type ResolveClient } from '../../core/http.ts';
import { baseOptionsSchema, parseOptions } from '../../core/options.ts';
import { getPath } from '../../core/path.ts';
import { clusterItemSpecs } from '../../core/clusterItem.ts';
import { fetchClusterApps } from '../../core/pagination.ts';
import { resolveFullDetail, type GetApp } from '../../core/fullDetail.ts';
import { parseScriptData } from '../../core/scriptData.ts';
import { resolveScriptRoot } from '../../core/scriptRoot.ts';
import { extract, type Extracted } from '../../core/spec.ts';
import { app } from '../app/app.ts';
import type { App } from '../app/schema.ts';
import { similarAppSchema, type SimilarApp } from './schema.ts';
import {
  CLUSTER_PAGE_MAPPINGS,
  findSimilarClusterPath,
  PAGINATION_MAPPINGS,
  SIMILAR_MAX_APPS,
  similarClusterPageRootSpec,
  similarClusterScriptDataSelection,
  similarDetailsScriptDataSelection,
  similarClusterUrl,
  similarDetailsUrl,
  similarItemSpecs,
} from './specs.ts';

export const similarOptionsSchema = z.extend(baseOptionsSchema, {
  appId: z.string().check(z.minLength(1)),
  fullDetail: z._default(z.boolean(), false),
});

export type SimilarOptions = z.input<typeof similarOptionsSchema>;

type ParsedSimilarOptions = z.infer<typeof similarOptionsSchema>;

const SIMILAR_CONTEXT = 'similar';

type SimilarItem = Extracted<typeof similarItemSpecs>;

export type SimilarQuery = Pick<
  ParsedSimilarOptions,
  'appId' | 'lang' | 'country' | 'throttle' | 'requestOptions' | 'onIntegrityEvent'
>;

export interface SimilarFirstPage {
  client: HttpClient;
  apps: SimilarItem[];
  token: string | undefined;
}

function extractClusterPage(root: unknown): {
  apps: SimilarItem[];
  token: string | undefined;
} {
  const appsData = getPath(root, CLUSTER_PAGE_MAPPINGS.apps);
  const apps = Array.isArray(appsData)
    ? appsData.map((item) => extract(item, similarItemSpecs, SIMILAR_CONTEXT))
    : [];
  const token = getPath(root, CLUSTER_PAGE_MAPPINGS.token);
  return { apps, token: typeof token === 'string' ? token : undefined };
}

export async function fetchSimilarFirstPage(
  query: SimilarQuery,
  resolveClient: ResolveClient,
): Promise<SimilarFirstPage> {
  const client = resolveClient(query);
  const detailsHtml = await client.request({
    url: similarDetailsUrl(query.appId, query.country),
  });
  const details = parseScriptData(detailsHtml, similarDetailsScriptDataSelection);

  const clusterPath = findSimilarClusterPath(details, query.onIntegrityEvent);
  if (clusterPath === undefined) {
    return { client, apps: [], token: undefined };
  }

  const clusterHtml = await client.request({
    url: similarClusterUrl(clusterPath, query.lang, query.country),
  });
  const clusterData = parseScriptData(clusterHtml, similarClusterScriptDataSelection);
  const clusterRoot = resolveScriptRoot(
    clusterData,
    similarClusterPageRootSpec,
    'similar cluster page',
    query.onIntegrityEvent,
  );
  return { client, ...extractClusterPage(clusterRoot.root) };
}

export function createSimilar(
  getApp: GetApp<App>,
  resolveClient: ResolveClient = clientFromOptions,
) {
  return async function similar(options: SimilarOptions): Promise<SimilarApp[] | App[]> {
    const parsed = parseOptions(similarOptionsSchema, options, SIMILAR_CONTEXT);
    const { client, apps, token } = await fetchSimilarFirstPage(parsed, resolveClient);

    const items = await fetchClusterApps({
      client,
      lang: parsed.lang,
      country: parsed.country,
      num: SIMILAR_MAX_APPS,
      initialApps: apps,
      initialToken: token,
      itemSpecs: clusterItemSpecs,
      appsPath: PAGINATION_MAPPINGS.apps,
      tokenPath: PAGINATION_MAPPINGS.token,
      context: SIMILAR_CONTEXT,
      onDegradation: parsed.onDegradation,
      onIntegrityEvent: parsed.onIntegrityEvent,
    });

    if (parsed.fullDetail) {
      return resolveFullDetail(items, parsed, getApp);
    }

    return z.array(similarAppSchema).parse(items);
  };
}

export const similar = createSimilar(app);
