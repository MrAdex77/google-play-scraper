import { z } from 'zod';
import { clientFromOptions, type ResolveClient } from '../../core/http.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { getPath } from '../../core/path.js';
import { clusterItemSpecs } from '../../core/clusterItem.js';
import { fetchClusterApps } from '../../core/pagination.js';
import { resolveFullDetail, type GetApp } from '../../core/fullDetail.js';
import { parseScriptData } from '../../core/scriptData.js';
import { extract, type Extracted } from '../../core/spec.js';
import { app } from '../app/app.js';
import type { App } from '../app/schema.js';
import { similarAppSchema, type SimilarApp } from './schema.js';
import {
  CLUSTER_PAGE_MAPPINGS,
  findSimilarClusterPath,
  PAGINATION_MAPPINGS,
  SIMILAR_MAX_APPS,
  similarClusterUrl,
  similarDetailsUrl,
  similarItemSpecs,
} from './specs.js';

export const similarOptionsSchema = baseOptionsSchema.extend({
  appId: z.string().min(1),
  fullDetail: z.boolean().default(false),
});

export type SimilarOptions = z.input<typeof similarOptionsSchema>;

const SIMILAR_CONTEXT = 'similar';

type SimilarItem = Extracted<typeof similarItemSpecs>;

function extractClusterPage(blocks: Record<string, unknown>): {
  apps: SimilarItem[];
  token: string | undefined;
} {
  const appsData = getPath(blocks, CLUSTER_PAGE_MAPPINGS.apps);
  const apps = Array.isArray(appsData)
    ? appsData.map((item) => extract(item, similarItemSpecs, SIMILAR_CONTEXT))
    : [];
  const token = getPath(blocks, CLUSTER_PAGE_MAPPINGS.token);
  return { apps, token: typeof token === 'string' ? token : undefined };
}

export function createSimilar(
  getApp: GetApp<App>,
  resolveClient: ResolveClient = clientFromOptions,
) {
  return async function similar(options: SimilarOptions): Promise<SimilarApp[] | App[]> {
    const parsed = parseOptions(similarOptionsSchema, options, SIMILAR_CONTEXT);

    const client = resolveClient(parsed);
    const detailsHtml = await client.request({
      url: similarDetailsUrl(parsed.appId, parsed.country),
    });
    const details = parseScriptData(detailsHtml);

    const clusterPath = findSimilarClusterPath(details);
    if (clusterPath === undefined) {
      return z.array(similarAppSchema).parse([]);
    }

    const clusterHtml = await client.request({
      url: similarClusterUrl(clusterPath, parsed.lang, parsed.country),
    });
    const clusterData = parseScriptData(clusterHtml);
    const page = extractClusterPage(clusterData.blocks);

    const items = await fetchClusterApps({
      client,
      lang: parsed.lang,
      country: parsed.country,
      num: SIMILAR_MAX_APPS,
      initialApps: page.apps,
      initialToken: page.token,
      itemSpecs: clusterItemSpecs,
      appsPath: PAGINATION_MAPPINGS.apps,
      tokenPath: PAGINATION_MAPPINGS.token,
      context: SIMILAR_CONTEXT,
      onDegradation: parsed.onDegradation,
    });

    if (parsed.fullDetail) {
      return resolveFullDetail(items, parsed, getApp);
    }

    return z.array(similarAppSchema).parse(items);
  };
}

export const similar = createSimilar(app);
