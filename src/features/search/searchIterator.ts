import type { z } from 'zod';
import { clientFromOptions, type ResolveClient } from '../../core/http.js';
import { parseOptions } from '../../core/options.js';
import { clusterPages } from '../../core/pagination.js';
import { searchOptionsSchema, SEARCH_CONTEXT, fetchSearchFirstPage } from './search.js';
import { searchResultSchema, type SearchResult } from './schema.js';
import { CLUSTER_MAPPINGS, filterByPrice, searchPageItemSpecs } from './specs.js';

const SEARCH_ITERATOR_CONTEXT = 'searchIterator';

export const searchIteratorOptionsSchema = searchOptionsSchema.omit({
  num: true,
  fullDetail: true,
});

export type SearchIteratorOptions = z.input<typeof searchIteratorOptionsSchema>;

type ParsedSearchIteratorOptions = z.infer<typeof searchIteratorOptionsSchema>;

async function* streamSearch(
  options: ParsedSearchIteratorOptions,
  resolveClient: ResolveClient,
): AsyncGenerator<SearchResult, void, undefined> {
  const { client, page } = await fetchSearchFirstPage(options, resolveClient);

  const pages = clusterPages({
    client,
    lang: options.lang,
    country: options.country,
    initialApps: page.apps,
    initialToken: page.token,
    itemSpecs: searchPageItemSpecs,
    appsPath: CLUSTER_MAPPINGS.apps,
    tokenPath: CLUSTER_MAPPINGS.token,
    context: SEARCH_CONTEXT,
  });

  for await (const clusterPage of pages) {
    for (const item of filterByPrice(clusterPage, options.price)) {
      yield searchResultSchema.parse(item);
    }
  }
}

export function createSearchIterator(resolveClient: ResolveClient = clientFromOptions) {
  return function searchIterator(
    options: SearchIteratorOptions,
  ): AsyncGenerator<SearchResult, void, undefined> {
    const parsed = parseOptions(searchIteratorOptionsSchema, options, SEARCH_ITERATOR_CONTEXT);
    return streamSearch(parsed, resolveClient);
  };
}

export const searchIterator = createSearchIterator();
