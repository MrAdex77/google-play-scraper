import * as z from 'zod/mini';
import { clientFromOptions, type ResolveClient } from '../../core/http.ts';
import { parseOptions } from '../../core/options.ts';
import { searchOptionsSchema, streamSearchItems } from './search.ts';
import { searchResultSchema, type SearchResult } from './schema.ts';

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
  for await (const item of streamSearchItems(options, resolveClient)) {
    yield searchResultSchema.parse(item);
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
