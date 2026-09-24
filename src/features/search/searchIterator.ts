import * as z from 'zod/mini';
import { clientFromOptions, type ResolveClient } from '../../core/http.ts';
import { parseOptions } from '../../core/options.ts';
import { clusterPages } from '../../core/pagination.ts';
import { searchOptionsSchema, SEARCH_CONTEXT, fetchSearchFirstPage } from './search.ts';
import { searchResultSchema, type SearchResult } from './schema.ts';
import { CLUSTER_MAPPINGS, filterByPrice, searchPageItemSpecs } from './specs.ts';

const SEARCH_ITERATOR_CONTEXT = 'searchIterator';

export const searchIteratorOptionsSchema = z.omit(searchOptionsSchema, {
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
    onDegradation: options.onDegradation,
    onIntegrityEvent: options.onIntegrityEvent,
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
