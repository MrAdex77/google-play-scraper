import { legacyBatchUrl, parseBatchResponse } from '../src/core/batchexecute.ts';
import { clusterItemSpecs } from '../src/core/clusterItem.ts';
import { clientFromOptions, type ResolveClient } from '../src/core/http.ts';
import { buildClusterBody, CLUSTER_PAGE_SIZE, CLUSTER_RPC_ID } from '../src/core/pagination.ts';
import { getPath } from '../src/core/path.ts';
import { extract } from '../src/core/spec.ts';
import {
  fetchSearchFirstPage,
  SEARCH_CONTEXT,
  type SearchFirstPage,
  type SearchQuery,
} from '../src/features/search/search.ts';
import { CLUSTER_MAPPINGS } from '../src/features/search/specs.ts';

export const SEARCH_CONTINUATION_ANCHORS = ['a', 'b', 'c', 'ab', 'minecraft', 'gmail'] as const;

export type SearchStorefront = Partial<Pick<SearchQuery, 'lang' | 'country' | 'price'>>;

export interface SearchContinuationAnchor extends SearchFirstPage {
  query: SearchQuery;
  token: string;
}

export interface SearchContinuationPage {
  added: string[];
  token: string | undefined;
}

export function searchQueryFor(term: string, storefront: SearchStorefront = {}): SearchQuery {
  return { term, lang: 'en', country: 'us', price: 'all', throttle: 1, ...storefront };
}

export async function* surfacedSearchAnchors(
  resolveClient: ResolveClient = clientFromOptions,
  storefront: SearchStorefront = {},
): AsyncGenerator<SearchContinuationAnchor, void, undefined> {
  for (const term of SEARCH_CONTINUATION_ANCHORS) {
    const query = searchQueryFor(term, storefront);
    const first = await fetchSearchFirstPage(query, resolveClient);
    if (first.page.token !== undefined) {
      yield { ...first, query, token: first.page.token };
    }
  }
}

export async function findSearchContinuationAnchor(
  resolveClient: ResolveClient = clientFromOptions,
  storefront: SearchStorefront = {},
): Promise<SearchContinuationAnchor> {
  for await (const anchor of surfacedSearchAnchors(resolveClient, storefront)) {
    return anchor;
  }
  throw new Error(
    `no search continuation anchor serves a token for ${JSON.stringify(storefront)}: re-anchor SEARCH_CONTINUATION_ANCHORS in e2e/searchAnchors.ts`,
  );
}

export async function fetchSearchContinuationPage(
  anchor: SearchContinuationAnchor,
): Promise<SearchContinuationPage> {
  const { client, query, page, token } = anchor;
  const payload = parseBatchResponse(
    await client.request({
      url: legacyBatchUrl(query.lang, query.country),
      method: 'POST',
      body: buildClusterBody(CLUSTER_PAGE_SIZE, token),
    }),
    CLUSTER_RPC_ID,
  );
  const apps = getPath(payload, CLUSTER_MAPPINGS.apps);
  const nextToken = getPath(payload, CLUSTER_MAPPINGS.token);
  const firstPageIds = new Set(page.apps.map((item) => item.appId));
  const items = Array.isArray(apps)
    ? apps.map((item) => extract(item, clusterItemSpecs, SEARCH_CONTEXT))
    : [];
  const added = [...new Set(items.map((item) => item.appId))].filter(
    (appId) => !firstPageIds.has(appId),
  );
  return { added, token: typeof nextToken === 'string' ? nextToken : undefined };
}
