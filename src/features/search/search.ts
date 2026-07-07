import { z } from 'zod';
import { BASE_URL } from '../../constants.js';
import { clientFromOptions } from '../../core/http.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { getPath } from '../../core/path.js';
import { fetchClusterApps } from '../../core/pagination.js';
import { resolveFullDetail, type GetApp } from '../../core/fullDetail.js';
import { parseScriptData, type ScriptData } from '../../core/scriptData.js';
import { extract, type Extracted } from '../../core/spec.js';
import { app } from '../app/app.js';
import type { App } from '../app/schema.js';
import { searchResultSchema, type SearchResult } from './schema.js';
import {
  CLUSTER_MAPPINGS,
  exactMatchSpecs,
  INITIAL_MAPPINGS,
  priceGoogleValue,
  searchItemSpecs,
  searchPageItemSpecs,
  SECTIONS_MAPPING,
} from './specs.js';

export const searchOptionsSchema = baseOptionsSchema.extend({
  term: z.string().min(1),
  num: z.number().int().min(1).max(250).default(20),
  price: z.enum(['all', 'free', 'paid']).default('all'),
  fullDetail: z.boolean().default(false),
});

export type SearchOptions = z.input<typeof searchOptionsSchema>;

const SEARCH_URL = `${BASE_URL}/store/search`;
const SEARCH_CONTEXT = 'search';

type SearchItem = Extracted<typeof searchPageItemSpecs>;

interface FirstPage {
  apps: SearchItem[];
  token: string | undefined;
}

function prependExactMatch(data: ScriptData, apps: SearchItem[]): SearchItem[] {
  const exactMatchData = getPath(data.blocks, INITIAL_MAPPINGS.app);
  if (exactMatchData === undefined || exactMatchData === null) {
    return apps;
  }
  let exactMatch: SearchItem;
  try {
    exactMatch = extract(exactMatchData, exactMatchSpecs, SEARCH_CONTEXT);
  } catch {
    return apps;
  }
  if (apps.some((item) => item.appId === exactMatch.appId)) {
    return apps;
  }
  return [exactMatch, ...apps];
}

function firstPage(data: ScriptData): FirstPage {
  const sections = getPath(data.blocks, INITIAL_MAPPINGS.sections);
  if (!Array.isArray(sections)) {
    return { apps: [], token: undefined };
  }
  for (const section of sections) {
    const apps = getPath(section, SECTIONS_MAPPING.apps);
    if (Array.isArray(apps) && apps.length > 0) {
      const extracted = apps.map((item) => extract(item, searchItemSpecs, SEARCH_CONTEXT));
      const token = getPath(section, SECTIONS_MAPPING.token);
      return {
        apps: prependExactMatch(data, extracted),
        token: typeof token === 'string' ? token : undefined,
      };
    }
  }
  return { apps: [], token: undefined };
}

export function createSearch(getApp: GetApp<App>) {
  return async function search(options: SearchOptions): Promise<SearchResult[] | App[]> {
    const parsed = parseOptions(searchOptionsSchema, options, SEARCH_CONTEXT);

    const params = new URLSearchParams({
      c: 'apps',
      q: parsed.term,
      hl: parsed.lang,
      gl: parsed.country,
      price: priceGoogleValue(parsed.price).toString(),
    });

    const client = clientFromOptions(parsed);
    const html = await client.request({ url: `${SEARCH_URL}?${params.toString()}` });
    const data = parseScriptData(html);
    const page = firstPage(data);

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
    });

    const sliced = items.slice(0, parsed.num);

    if (parsed.fullDetail) {
      return resolveFullDetail(sliced, parsed, getApp);
    }

    return z.array(searchResultSchema).parse(sliced);
  };
}

export const search = createSearch(app);
