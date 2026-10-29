import type * as Library from '../src/index.ts';

type Scenario = (library: typeof Library) => Promise<unknown>;

export type Outcome = { value: unknown } | { error: { name: string; library: boolean } };

const WHATSAPP = 'com.whatsapp';
const TRANSLATE = 'com.google.android.apps.translate';
const MISSING_APP = 'com.adex77.definitely.not.a.real.app';
const GOOGLE_DEVELOPER = '5700313618786177705';
const ROUTED_URLS = ['https://play.google.com/store/apps/details?id=a&gl=DE', 'not a url'];

const routedBody = (body: string) => (): Promise<Response> => Promise.resolve(new Response(body));

export const scenarios = {
  surface: (library) =>
    Promise.resolve({
      named: Object.keys(library).sort(),
      aggregate: Object.keys(library.default).sort(),
    }),
  app: (library) => library.default.app({ appId: WHATSAPP }),
  search: (library) => library.search({ term: 'panda', num: 10 }),
  suggest: (library) => library.suggest({ term: 'pand' }),
  list: (library) =>
    library.list({
      collection: library.collection.TOP_FREE,
      category: library.category.GAME,
      num: 10,
    }),
  developer: (library) => library.developer({ devId: GOOGLE_DEVELOPER, num: 10 }),
  similar: (library) => library.similar({ appId: TRANSLATE }),
  reviews: (library) => library.reviews({ appId: TRANSLATE, num: 10 }),
  permissions: (library) => library.permissions({ appId: TRANSLATE }),
  dataSafety: (library) => library.dataSafety({ appId: TRANSLATE }),
  memoized: async (library) => {
    const client = library.memoized();
    const first = await client.app({ appId: WHATSAPP });
    const second = await client.app({ appId: WHATSAPP });
    return { reused: first === second, size: client.cache.size };
  },
  notFound: (library) => library.app({ appId: MISSING_APP }),
  retry: (library) => library.app({ appId: WHATSAPP, requestOptions: { retries: 1 } }),
  aborted: (library) =>
    library.app({ appId: WHATSAPP, requestOptions: { signal: AbortSignal.abort() } }),
  countryRouting: (library) => {
    const routed = library.createCountryFetch({
      perCountry: { de: routedBody('de') },
      fallback: routedBody('fallback'),
    });
    return Promise.all(ROUTED_URLS.map(async (url) => (await routed(url)).text()));
  },
} satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof scenarios;

export function isScenarioName(name: string | null): name is ScenarioName {
  return name !== null && Object.hasOwn(scenarios, name);
}

export const scenarioNames = Object.keys(scenarios).filter(isScenarioName);

export async function settle(name: ScenarioName, library: typeof Library): Promise<Outcome> {
  try {
    return { value: await scenarios[name](library) };
  } catch (error) {
    return {
      error: {
        name: error instanceof Error ? error.name : typeof error,
        library: error instanceof library.GooglePlayError,
      },
    };
  }
}
