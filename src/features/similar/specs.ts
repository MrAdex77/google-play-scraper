import { BASE_URL } from '../../constants.js';
import { isFreeMicros, microsToUnits, resolveAppUrl } from '../../core/appItemTransforms.js';
import { getPath, type Path } from '../../core/path.js';
import { rawArrayPathSchema } from '../../core/raw.js';
import { resolveScriptRoot, type ScriptRootSpec } from '../../core/scriptRoot.js';
import { deriveScriptDataSelection, type ScriptData } from '../../core/scriptData.js';
import type { OnIntegrityEvent } from '../../core/integrity.js';
import { defaulted, optional, required, type SpecMap } from '../../core/spec.js';
import { similarAppSchema } from './schema.js';
import * as z from 'zod/mini';

const shape = similarAppSchema.shape;
const REQUIRED = required();
const OPTIONAL = optional();

export const CLUSTERS_RPC_ID = 'ag2B9c';
export const SIMILAR_MAX_APPS = 100;

const CLUSTERS_PATH: readonly number[] = [1, 1];

export const CLUSTER_MAPPING = {
  title: [21, 1, 0],
  url: [21, 1, 2, 4, 2],
} satisfies Record<string, Path>;

const SIMILAR_APPS = 'Similar apps';
const SIMILAR_GAMES = 'Similar games';

export const CLUSTER_PAGE_MAPPINGS = {
  apps: [0, 1, 0, 21, 0],
  token: [0, 1, 0, 21, 1, 3, 1],
} satisfies Record<string, Path>;

export const similarDetailsRootSpec = {
  rpcId: CLUSTERS_RPC_ID,
  paths: [],
  schema: z.union([z.tuple([]), rawArrayPathSchema(CLUSTERS_PATH, z.array(z.unknown()))]),
  missing: defaulted(() => []),
} satisfies ScriptRootSpec;

export const similarClusterPageRootSpec = {
  paths: [['ds:3']],
  schema: z.union([
    z.tuple([z.tuple([])]),
    rawArrayPathSchema(CLUSTER_PAGE_MAPPINGS.apps, z.array(z.unknown())),
  ]),
  missing: required(),
} satisfies ScriptRootSpec;

export const similarDetailsScriptDataSelection = deriveScriptDataSelection([
  similarDetailsRootSpec,
]);
export const similarClusterScriptDataSelection = deriveScriptDataSelection([
  similarClusterPageRootSpec,
]);

export const PAGINATION_MAPPINGS = {
  apps: [0, 0, 0],
  token: [0, 0, 7, 1],
} satisfies Record<string, Path>;

export function similarDetailsUrl(appId: string, country: string): string {
  const params = new URLSearchParams({ id: appId, hl: 'en', gl: country });
  return `${BASE_URL}/store/apps/details?${params.toString()}`;
}

export function similarClusterUrl(clusterPath: string, lang: string, country: string): string {
  return `${BASE_URL}${clusterPath}&gl=${country}&hl=${lang}`;
}

export function findSimilarClusterPath(
  data: ScriptData,
  onIntegrityEvent?: OnIntegrityEvent,
): string | undefined {
  const resolved = resolveScriptRoot(
    data,
    similarDetailsRootSpec,
    'similar details',
    onIntegrityEvent,
  );
  const clusters = getPath(resolved.root, CLUSTERS_PATH);
  if (Array.isArray(clusters)) {
    for (const cluster of clusters) {
      const title = getPath(cluster, CLUSTER_MAPPING.title);
      if (title === SIMILAR_APPS || title === SIMILAR_GAMES) {
        const clusterPath = getPath(cluster, CLUSTER_MAPPING.url);
        if (typeof clusterPath === 'string') {
          return clusterPath;
        }
      }
    }
  }
  return undefined;
}

export const similarItemSpecs = {
  title: { paths: [[3]], missing: REQUIRED, schema: shape.title },
  appId: { paths: [[0, 0]], missing: REQUIRED, schema: shape.appId },
  url: { paths: [[10, 4, 2]], missing: REQUIRED, schema: shape.url, transform: resolveAppUrl },
  icon: { paths: [[1, 3, 2]], missing: REQUIRED, schema: shape.icon },
  developer: { paths: [[14]], missing: REQUIRED, schema: shape.developer },
  currency: { paths: [[8, 1, 0, 1]], missing: OPTIONAL, schema: shape.currency },
  price: {
    paths: [[8, 1, 0, 0]],
    missing: defaulted(() => 0),
    schema: shape.price,
    transform: microsToUnits,
  },
  free: {
    paths: [[8, 1, 0, 0]],
    missing: defaulted(() => false),
    schema: shape.free,
    transform: isFreeMicros,
  },
  summary: { paths: [[13, 1]], missing: OPTIONAL, schema: shape.summary },
  scoreText: { paths: [[4, 0]], missing: OPTIONAL, schema: shape.scoreText },
  score: { paths: [[4, 1]], missing: OPTIONAL, schema: shape.score },
} satisfies SpecMap;
