import * as z from 'zod/mini';
import { BASE_URL } from '../../constants.ts';
import { ParseError } from '../../core/errors.ts';
import { clientFromOptions, type HttpClient, type ResolveClient } from '../../core/http.ts';
import { parseOptionalSection, type OnIntegrityEvent } from '../../core/integrity.ts';
import { baseOptionsSchema, parseOptions } from '../../core/options.ts';
import { getPath } from '../../core/path.ts';
import { fetchClusterApps } from '../../core/pagination.ts';
import { resolveFullDetail, type GetApp } from '../../core/fullDetail.ts';
import { parseScriptData } from '../../core/scriptData.ts';
import { resolveScriptRoot } from '../../core/scriptRoot.ts';
import { extract, type Extracted } from '../../core/spec.ts';
import { app } from '../app/app.ts';
import type { App } from '../app/schema.ts';
import { searchResultSchema, type SearchResult } from './schema.ts';
import {
  CLUSTER_MAPPINGS,
  EXACT_MATCH_MAPPINGS,
  exactMatchSpecs,
  filterByPrice,
  INITIAL_MAPPINGS,
  isExactMatchCard,
  priceGoogleValue,
  searchItemSpecs,
  searchPageItemSpecs,
  searchRootSpec,
  searchScriptDataSelection,
  SECTIONS_MAPPING,
} from './specs.ts';

export const searchOptionsSchema = z.extend(baseOptionsSchema, {
  term: z.string().check(z.minLength(1)),
  num: z._default(z.int().check(z.gte(1), z.lte(250)), 20),
  price: z._default(z.enum(['all', 'free', 'paid']), 'all'),
  fullDetail: z._default(z.boolean(), false),
});

export type SearchOptions = z.input<typeof searchOptionsSchema>;

type ParsedSearchOptions = z.infer<typeof searchOptionsSchema>;

export const SEARCH_URL = `${BASE_URL}/store/search`;
export const SEARCH_CONTEXT = 'search';

type SearchItem = Extracted<typeof searchPageItemSpecs>;

export type SearchQuery = Pick<
  ParsedSearchOptions,
  'term' | 'lang' | 'country' | 'price' | 'throttle' | 'requestOptions' | 'onIntegrityEvent'
>;

interface FirstPage {
  apps: SearchItem[];
  token: string | undefined;
}

export interface SearchFirstPage {
  client: HttpClient;
  page: FirstPage;
}

export async function fetchSearchFirstPage(
  query: SearchQuery,
  resolveClient: ResolveClient,
): Promise<SearchFirstPage> {
  const params = new URLSearchParams({
    c: 'apps',
    q: query.term,
    hl: query.lang,
    gl: query.country,
    price: priceGoogleValue(query.price).toString(),
  });

  const client = resolveClient(query);
  const html = await client.request({ url: `${SEARCH_URL}?${params.toString()}` });
  const data = parseScriptData(html, searchScriptDataSelection);
  const root = resolveScriptRoot(data, searchRootSpec, 'search root', query.onIntegrityEvent);
  return { client, page: firstPage(root.root, query.onIntegrityEvent) };
}

interface ScannedCard {
  card: unknown;
  entryIndex: number;
  sectionIndex: number;
}

function* scanForExactMatchCards(sections: readonly unknown[]): Generator<ScannedCard> {
  for (const [sectionIndex, section] of sections.entries()) {
    if (!Array.isArray(section)) {
      continue;
    }
    for (const [entryIndex, entry] of section.entries()) {
      if (isExactMatchCard(entry)) {
        yield { card: entry, entryIndex, sectionIndex };
      }
    }
  }
}

function extractExactMatch(
  card: unknown,
  onIntegrityEvent?: OnIntegrityEvent,
): SearchItem | undefined {
  return parseOptionalSection(
    SEARCH_CONTEXT,
    () => extract(card, exactMatchSpecs, SEARCH_CONTEXT),
    onIntegrityEvent,
  );
}

function reportUnusableCard(
  card: unknown,
  onIntegrityEvent?: OnIntegrityEvent,
): SearchItem | undefined {
  if (card === undefined || card === null) {
    return undefined;
  }
  return extractExactMatch(card, onIntegrityEvent);
}

function resolveExactMatch(
  sections: readonly unknown[],
  onIntegrityEvent?: OnIntegrityEvent,
): SearchItem | undefined {
  for (const section of sections) {
    const candidate = getPath(section, EXACT_MATCH_MAPPINGS.card);
    if (!isExactMatchCard(candidate)) {
      continue;
    }
    const anchoredMatch = extractExactMatch(candidate);
    if (anchoredMatch !== undefined) {
      return anchoredMatch;
    }
  }

  let unusableCard: unknown;
  for (const scanned of scanForExactMatchCards(sections)) {
    const scannedMatch = extractExactMatch(scanned.card);
    if (scannedMatch !== undefined) {
      const error = new ParseError(
        `${SEARCH_CONTEXT}: exact match card resolved at sections.${scanned.sectionIndex.toString()}.${scanned.entryIndex.toString()} instead of its anchor`,
      );
      onIntegrityEvent?.({ context: SEARCH_CONTEXT, reason: 'section-anchor-fallback', error });
      return scannedMatch;
    }
    unusableCard ??= scanned.card;
  }

  return reportUnusableCard(
    unusableCard ?? getPath(sections[0], EXACT_MATCH_MAPPINGS.card),
    onIntegrityEvent,
  );
}

function prependExactMatch(
  sections: readonly unknown[],
  apps: SearchItem[],
  onIntegrityEvent?: OnIntegrityEvent,
): SearchItem[] {
  const exactMatch = resolveExactMatch(sections, onIntegrityEvent);
  if (exactMatch === undefined) {
    return apps;
  }
  if (apps.some((item) => item.appId === exactMatch.appId)) {
    return apps;
  }
  return [exactMatch, ...apps];
}

function firstPage(root: unknown, onIntegrityEvent?: OnIntegrityEvent): FirstPage {
  const sections = getPath(root, INITIAL_MAPPINGS.sections);
  if (!Array.isArray(sections)) {
    throw new ParseError(`${SEARCH_CONTEXT}: validated sections root is unavailable`);
  }
  for (const section of sections) {
    const apps = getPath(section, SECTIONS_MAPPING.apps);
    if (Array.isArray(apps) && apps.length > 0) {
      const extracted = apps.map((item) => extract(item, searchItemSpecs, SEARCH_CONTEXT));
      const token = getPath(section, SECTIONS_MAPPING.token);
      return {
        apps: prependExactMatch(sections, extracted, onIntegrityEvent),
        token: typeof token === 'string' ? token : undefined,
      };
    }
  }
  return { apps: prependExactMatch(sections, [], onIntegrityEvent), token: undefined };
}

export function createSearch(
  getApp: GetApp<App>,
  resolveClient: ResolveClient = clientFromOptions,
) {
  return async function search(options: SearchOptions): Promise<SearchResult[] | App[]> {
    const parsed = parseOptions(searchOptionsSchema, options, SEARCH_CONTEXT);
    const { client, page } = await fetchSearchFirstPage(parsed, resolveClient);

    const items = await fetchClusterApps({
      client,
      lang: parsed.lang,
      country: parsed.country,
      num: parsed.num,
      initialApps: page.apps,
      initialToken: page.token,
      itemSpecs: searchPageItemSpecs,
      appsPath: CLUSTER_MAPPINGS.apps,
      tokenPath: CLUSTER_MAPPINGS.token,
      context: SEARCH_CONTEXT,
      onDegradation: parsed.onDegradation,
      onIntegrityEvent: parsed.onIntegrityEvent,
    });

    const sliced = filterByPrice(items, parsed.price).slice(0, parsed.num);

    if (parsed.fullDetail) {
      return resolveFullDetail(sliced, parsed, getApp);
    }

    return z.array(searchResultSchema).parse(sliced);
  };
}

export const search = createSearch(app);
