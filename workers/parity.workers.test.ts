import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Response as WorkerResponse, type Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as library from '../src/index.ts';
import {
  COMPATIBILITY_DATES,
  PUBLISHED_ENTRY,
  bundleProbe,
  runInWorker,
  startProbe,
} from './runtime.ts';
import { scenarioNames, settle, type ScenarioName } from './scenarios.ts';

interface Served {
  status: number;
  body: string;
}

interface RecordedRequest {
  method: string;
  endpoint: string;
  query: [string, string][];
  form: [string, string][];
}

interface IncomingRequest {
  method: string;
  url: string;
  text(): Promise<string>;
}

const FAILING_SCENARIOS = [
  ['notFound', 'NotFoundError'],
  ['aborted', 'AbortError'],
] as const satisfies readonly (readonly [ScenarioName, string])[];

const failingNames: readonly ScenarioName[] = FAILING_SCENARIOS.map(([name]) => name);

const succeedingScenarios = scenarioNames.filter((name) => !failingNames.includes(name));

const fixture = (path: string): Served => ({
  status: 200,
  body: readFileSync(fileURLToPath(new URL(`../test/fixtures/${path}`, import.meta.url)), 'utf8'),
});

const status = (code: number): Served => ({ status: code, body: '' });

const SERVED: Record<ScenarioName, readonly Served[]> = {
  surface: [],
  app: [fixture('app/whatsapp.html')],
  search: [fixture('search/panda.html')],
  suggest: [fixture('suggest/pand.txt')],
  list: [fixture('list/topfree-game.txt')],
  developer: [fixture('developer/google.html')],
  similar: [
    fixture('similar/translate-details.html'),
    fixture('similar/translate-cluster.html'),
    fixture('similar/mhadv-continuation-last.txt'),
  ],
  reviews: [fixture('reviews/translate-initial.txt')],
  permissions: [fixture('permissions/translate.txt')],
  dataSafety: [fixture('datasafety/translate.html')],
  memoized: [fixture('app/whatsapp.html')],
  notFound: [status(404)],
  retry: [status(503), fixture('app/whatsapp.html')],
  aborted: [],
  countryRouting: [],
};

function createFixtureServer() {
  let queue: Served[] = [];
  let requests: RecordedRequest[] = [];
  return {
    load(name: ScenarioName): void {
      queue = [...SERVED[name]];
      requests = [];
    },
    async serve(request: IncomingRequest): Promise<Served> {
      const url = new URL(request.url);
      requests.push({
        method: request.method,
        endpoint: `${url.origin}${url.pathname}`,
        query: [...url.searchParams],
        form: [...new URLSearchParams(await request.text())],
      });
      return queue.shift() ?? status(599);
    },
    drain(): { requests: RecordedRequest[]; unserved: number } {
      return { requests, unserved: queue.length };
    },
  };
}

const server = createFixtureServer();
const inNode = new Map<ScenarioName, unknown>();
let script: string;

async function runInNode(name: ScenarioName): Promise<unknown> {
  server.load(name);
  const outcome = await settle(name, library);
  return JSON.parse(JSON.stringify({ outcome, ...server.drain() }));
}

async function runInWorkerd(worker: Miniflare, name: ScenarioName): Promise<unknown> {
  server.load(name);
  const outcome = await runInWorker(worker, name);
  return { outcome, ...server.drain() };
}

beforeAll(async () => {
  vi.stubGlobal('fetch', async (...args: Parameters<typeof fetch>) => {
    const served = await server.serve(new Request(...args));
    return new Response(served.body, { status: served.status });
  });
  for (const name of scenarioNames) {
    inNode.set(name, await runInNode(name));
  }
  vi.unstubAllGlobals();
  script = await bundleProbe(PUBLISHED_ENTRY);
});

describe('node baseline', () => {
  it.each(scenarioNames)('%s consumes exactly the responses it was served', (name) => {
    expect(inNode.get(name)).toMatchObject({ unserved: 0 });
  });

  it.each(succeedingScenarios)('%s resolves with a value', (name) => {
    expect(inNode.get(name)).toHaveProperty('outcome.value');
  });

  it.each(FAILING_SCENARIOS)('%s rejects with %s', (name, errorName) => {
    expect(inNode.get(name)).toHaveProperty('outcome.error.name', errorName);
  });

  it('memoized serves the second call from one cache entry', () => {
    expect(inNode.get('memoized')).toHaveProperty('outcome.value', { reused: true, size: 1 });
  });

  it('countryRouting sends the german url to its route and the unparsable one to the fallback', () => {
    expect(inNode.get('countryRouting')).toHaveProperty('outcome.value', ['de', 'fallback']);
  });
});

describe.each(Object.values(COMPATIBILITY_DATES))(
  'workerd at compatibility date %s',
  (compatibilityDate) => {
    let worker: Miniflare;

    beforeAll(() => {
      worker = startProbe(script, compatibilityDate, async (request) => {
        const served = await server.serve(request);
        return new WorkerResponse(served.body, { status: served.status });
      });
    });

    afterAll(async () => {
      await worker.dispose();
    });

    it.each(scenarioNames)('%s matches Node.js', async (name) => {
      expect(await runInWorkerd(worker, name)).toEqual(inNode.get(name));
    });
  },
);
