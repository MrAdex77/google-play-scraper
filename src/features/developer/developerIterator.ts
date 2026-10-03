import * as z from 'zod/mini';
import { clientFromOptions, type ResolveClient } from '../../core/http.ts';
import { parseOptions } from '../../core/options.ts';
import { clusterPages } from '../../core/pagination.ts';
import {
  developerClusterParams,
  developerOptionsSchema,
  fetchDeveloperFirstPage,
} from './developer.ts';
import { developerAppSchema, type DeveloperApp } from './schema.ts';

const DEVELOPER_ITERATOR_CONTEXT = 'developerIterator';

export const developerIteratorOptionsSchema = z.omit(developerOptionsSchema, {
  num: true,
  fullDetail: true,
});

export type DeveloperIteratorOptions = z.input<typeof developerIteratorOptionsSchema>;

type ParsedDeveloperIteratorOptions = z.infer<typeof developerIteratorOptionsSchema>;

async function* streamDeveloper(
  options: ParsedDeveloperIteratorOptions,
  resolveClient: ResolveClient,
): AsyncGenerator<DeveloperApp, void, undefined> {
  const firstPage = await fetchDeveloperFirstPage(options, resolveClient);
  const pages = clusterPages(developerClusterParams(options, firstPage));

  for await (const page of pages) {
    for (const item of page) {
      yield developerAppSchema.parse(item);
    }
  }
}

export function createDeveloperIterator(resolveClient: ResolveClient = clientFromOptions) {
  return function developerIterator(
    options: DeveloperIteratorOptions,
  ): AsyncGenerator<DeveloperApp, void, undefined> {
    const parsed = parseOptions(
      developerIteratorOptionsSchema,
      options,
      DEVELOPER_ITERATOR_CONTEXT,
    );
    return streamDeveloper(parsed, resolveClient);
  };
}

export const developerIterator = createDeveloperIterator();
