import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';
import {
  Miniflare,
  type Request as WorkerRequest,
  type Response as WorkerResponse,
} from 'miniflare';
import type { ScenarioName } from './scenarios.ts';

export const COMPATIBILITY_DATES = {
  legacyUrl: '2022-01-01',
  standardUrl: '2022-10-31',
  current: '2026-07-30',
} as const;

export const PUBLISHED_ENTRY = fileURLToPath(new URL('../dist/index.js', import.meta.url));

const PROBE_ENTRY = fileURLToPath(new URL('./probe.ts', import.meta.url));
const PROBE_ORIGIN = 'http://probe';
const LIBRARY_IMPORT = /^\.\.\/src\/index\.ts$/;
const WORKER_CONDITIONS = ['workerd', 'worker', 'browser'];
const WORKER_MAIN_FIELDS = ['browser', 'module', 'main'];

type Outbound = (request: WorkerRequest) => Promise<WorkerResponse>;

function libraryAt(entry: string): Plugin {
  return {
    name: 'library-entry',
    setup(probe) {
      probe.onResolve({ filter: LIBRARY_IMPORT }, () => ({ path: entry }));
    },
  };
}

export async function bundleProbe(libraryEntry: string): Promise<string> {
  const result = await build({
    entryPoints: [PROBE_ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    conditions: WORKER_CONDITIONS,
    mainFields: WORKER_MAIN_FIELDS,
    plugins: [libraryAt(libraryEntry)],
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles.map((file) => file.text).join('');
}

export function startProbe(
  script: string,
  compatibilityDate: string,
  outboundService?: Outbound,
): Miniflare {
  return new Miniflare({
    modules: true,
    script,
    compatibilityDate,
    outboundService,
  });
}

export async function runInWorker(worker: Miniflare, name: ScenarioName): Promise<unknown> {
  const response = await worker.dispatchFetch(`${PROBE_ORIGIN}/?scenario=${name}`);
  return response.json();
}
