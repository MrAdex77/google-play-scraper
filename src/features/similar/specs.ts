import { BASE_URL } from '../../constants.js';
import { getPath, type Path } from '../../core/path.js';
import { resolveDsKey, type ScriptData } from '../../core/scriptData.js';
import type { SpecMap } from '../../core/spec.js';
import { similarAppSchema } from './schema.js';

const MICROS_PER_UNIT = 1_000_000;
const shape = similarAppSchema.shape;

export const CLUSTERS_RPC_ID = 'ag2B9c';
export const SIMILAR_MAX_APPS = 100;

const CLUSTERS_PATH: Path = [1, 1];

export const CLUSTER_MAPPING = {
  title: [21, 1, 0],
  url: [21, 1, 2, 4, 2],
} satisfies Record<string, Path>;

const SIMILAR_APPS = 'Similar apps';
const SIMILAR_GAMES = 'Similar games';

export const CLUSTER_PAGE_MAPPINGS = {
  apps: ['ds:3', 0, 1, 0, 21, 0],
  token: ['ds:3', 0, 1, 0, 21, 1, 3, 1],
} satisfies Record<string, Path>;

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

export function findSimilarClusterPath(data: ScriptData): string | undefined {
  const dsKey = resolveDsKey(data, CLUSTERS_RPC_ID);
  if (dsKey === undefined) {
    return undefined;
  }
  const clusters = getPath(data.blocks, [dsKey, ...CLUSTERS_PATH]);
  if (!Array.isArray(clusters)) {
    return undefined;
  }
  for (const cluster of clusters) {
    const title = getPath(cluster, CLUSTER_MAPPING.title);
    if (title === SIMILAR_APPS || title === SIMILAR_GAMES) {
      const clusterPath = getPath(cluster, CLUSTER_MAPPING.url);
      if (typeof clusterPath === 'string') {
        return clusterPath;
      }
    }
  }
  return undefined;
}

function resolveUrl(value: unknown): string | undefined {
  return typeof value === 'string' ? new URL(value, BASE_URL).toString() : undefined;
}

function microsToUnits(value: unknown): number {
  return typeof value === 'number' ? value / MICROS_PER_UNIT || 0 : 0;
}

function isFree(value: unknown): boolean {
  return value === 0;
}

export const similarItemSpecs = {
  title: { paths: [[3]], schema: shape.title },
  appId: { paths: [[0, 0]], schema: shape.appId },
  url: { paths: [[10, 4, 2]], schema: shape.url, transform: resolveUrl },
  icon: { paths: [[1, 3, 2]], schema: shape.icon },
  developer: { paths: [[14]], schema: shape.developer },
  currency: { paths: [[8, 1, 0, 1]], schema: shape.currency },
  price: { paths: [[8, 1, 0, 0]], schema: shape.price, transform: microsToUnits },
  free: { paths: [[8, 1, 0, 0]], schema: shape.free, transform: isFree },
  summary: { paths: [[13, 1]], schema: shape.summary },
  scoreText: { paths: [[4, 0]], schema: shape.scoreText },
  score: { paths: [[4, 1]], schema: shape.score },
} satisfies SpecMap;
