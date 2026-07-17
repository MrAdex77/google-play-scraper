import * as z from 'zod/mini';
import { clientFromOptions, type ResolveClient } from '../../core/http.js';
import { parseOptions } from '../../core/options.js';
import { clusterItemSpecs } from '../../core/clusterItem.js';
import { clusterPages } from '../../core/pagination.js';
import { DEVELOPER_CONTEXT, developerOptionsSchema, fetchDeveloperFirstPage } from './developer.js';
import { developerAppSchema, type DeveloperApp } from './schema.js';
import { CLUSTER_MAPPINGS } from './specs.js';

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
  const { client, apps, token } = await fetchDeveloperFirstPage(options, resolveClient);

  const pages = clusterPages({
    client,
    lang: options.lang,
    country: options.country,
    initialApps: apps,
    initialToken: token,
    itemSpecs: clusterItemSpecs,
    appsPath: CLUSTER_MAPPINGS.apps,
    tokenPath: CLUSTER_MAPPINGS.token,
    context: DEVELOPER_CONTEXT,
    onDegradation: options.onDegradation,
  });

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
