import { clientFromOptions, type ResolveClient } from '../src/core/http.ts';
import {
  fetchSearchFirstPage,
  type SearchFirstPage,
  type SearchQuery,
} from '../src/features/search/search.ts';

export const SEARCH_CONTINUATION_ANCHORS = ['a', 'b', 'c', 'ab', 'minecraft', 'gmail'] as const;

export type SearchStorefront = Partial<Pick<SearchQuery, 'lang' | 'country' | 'price'>>;

export interface SearchContinuationAnchor extends SearchFirstPage {
  query: SearchQuery;
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
      yield { ...first, query };
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
