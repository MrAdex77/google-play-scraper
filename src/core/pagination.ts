import { BATCH_URL, parseBatchResponse } from './batchexecute.js';
import type { HttpClient } from './http.js';
import { getPath, type Path } from './path.js';
import { extract, type Extracted, type SpecMap } from './spec.js';

export const CLUSTER_RPC_ID = 'qnKhOb';
export const CLUSTER_PAGE_SIZE = 100;

const CLUSTER_STATIC_QUERY =
  'rpcids=qnKhOb&f.sid=-697906427155521722&bl=boq_playuiserver_20190903.08_p0';
const CLUSTER_TRAILING_QUERY = 'authuser&soc-app=121&soc-platform=1&soc-device=1&_reqid=1065213';

export function clusterUrl(lang: string, country: string): string {
  return `${BATCH_URL}?${CLUSTER_STATIC_QUERY}&hl=${lang}&gl=${country}&${CLUSTER_TRAILING_QUERY}`;
}

export function buildClusterBody(numberOfApps: number, withToken: string): string {
  return `f.req=%5B%5B%5B%22qnKhOb%22%2C%22%5B%5Bnull%2C%5B%5B10%2C%5B10%2C${numberOfApps.toString()}%5D%5D%2Ctrue%2Cnull%2C%5B96%2C27%2C4%2C8%2C57%2C30%2C110%2C79%2C11%2C16%2C49%2C1%2C3%2C9%2C12%2C104%2C55%2C56%2C51%2C10%2C34%2C77%5D%5D%2Cnull%2C%5C%22${withToken}%5C%22%5D%5D%22%2Cnull%2C%22generic%22%5D%5D%5D`;
}

function asToken(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export interface ClusterPagesParams<M extends SpecMap> {
  client: HttpClient;
  lang: string;
  country: string;
  initialApps: Extracted<M>[];
  initialToken: string | undefined;
  itemSpecs: M;
  appsPath: Path;
  tokenPath: Path;
  context: string;
}

export interface FetchClusterAppsParams<M extends SpecMap> extends ClusterPagesParams<M> {
  num: number;
}

export async function* clusterPages<M extends SpecMap>(
  params: ClusterPagesParams<M>,
): AsyncGenerator<Extracted<M>[], void, undefined> {
  const { client, lang, country, itemSpecs, appsPath, tokenPath, context } = params;

  if (params.initialApps.length > 0) {
    yield params.initialApps;
  }

  const seenTokens = new Set<string>();
  let token = asToken(params.initialToken);

  while (token !== undefined && !seenTokens.has(token)) {
    seenTokens.add(token);
    const body = buildClusterBody(CLUSTER_PAGE_SIZE, token);
    const text = await client.request({ url: clusterUrl(lang, country), method: 'POST', body });
    const payload = parseBatchResponse(text, CLUSTER_RPC_ID);

    const apps = getPath(payload, appsPath);
    if (!Array.isArray(apps) || apps.length === 0) {
      return;
    }
    yield apps.map((item) => extract(item, itemSpecs, context));
    token = asToken(getPath(payload, tokenPath));
  }
}

export async function fetchClusterApps<M extends SpecMap>(
  params: FetchClusterAppsParams<M>,
): Promise<Extracted<M>[]> {
  const { num, ...pageParams } = params;
  const collected: Extracted<M>[] = [];

  for await (const page of clusterPages(pageParams)) {
    for (const item of page) {
      collected.push(item);
    }
    if (collected.length >= num) {
      break;
    }
  }

  return collected.slice(0, num);
}
