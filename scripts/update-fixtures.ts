import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL } from '../src/constants.js';
import { buildBatchBody } from '../src/core/batchexecute.js';
import { createHttpClient, type HttpClient } from '../src/core/http.js';
import { buildSuggestPayload, SUGGEST_RPC_ID, suggestUrl } from '../src/features/suggest/specs.js';
import { buildListBody, CLUSTER_NAMES, listUrl } from '../src/features/list/specs.js';
import { category, collection } from '../src/constants.js';
import { developerUrl } from '../src/features/developer/specs.js';
import {
  findSimilarClusterPath,
  similarClusterUrl,
  similarDetailsUrl,
} from '../src/features/similar/specs.js';
import { parseScriptData } from '../src/core/scriptData.js';

interface Recorder {
  name: string;
  run(client: HttpClient): Promise<void>;
}

const THROTTLE_REQUESTS_PER_SECOND = 1;

const fixturesRoot = fileURLToPath(new URL('../test/fixtures', import.meta.url));

async function writeFixture(relativePath: string, body: string): Promise<void> {
  const target = join(fixturesRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body, 'utf8');
}

function detailsUrl(appId: string): string {
  const params = new URLSearchParams({ id: appId, hl: 'en', gl: 'us' });
  return `${BASE_URL}/store/apps/details?${params.toString()}`;
}

function appPageRecorder(appId: string, file: string): Recorder {
  return {
    name: 'app',
    async run(client) {
      const html = await client.request({ url: detailsUrl(appId) });
      await writeFixture(file, html);
    },
  };
}

function searchUrl(term: string): string {
  const params = new URLSearchParams({ c: 'apps', q: term, hl: 'en', gl: 'us', price: '0' });
  return `${BASE_URL}/store/search?${params.toString()}`;
}

function searchHtmlRecorder(term: string, file: string): Recorder {
  return {
    name: 'search',
    async run(client) {
      const html = await client.request({ url: searchUrl(term) });
      await writeFixture(file, html);
    },
  };
}

function suggestRecorder(term: string, file: string): Recorder {
  return {
    name: 'suggest',
    async run(client) {
      const body = buildBatchBody(SUGGEST_RPC_ID, buildSuggestPayload(term), []);
      const response = await client.request({
        url: suggestUrl('en', 'us'),
        method: 'POST',
        body,
      });
      await writeFixture(file, response);
    },
  };
}

function listRecorder(
  collectionValue: keyof typeof collection,
  categoryValue: keyof typeof category,
  num: number,
  file: string,
): Recorder {
  return {
    name: 'list',
    async run(client) {
      const body = buildListBody({
        num: num.toString(),
        collection: CLUSTER_NAMES[collection[collectionValue]],
        category: category[categoryValue],
      });
      const response = await client.request({
        url: listUrl('en', 'us'),
        method: 'POST',
        body,
      });
      await writeFixture(file, response);
    },
  };
}

function developerRecorder(devId: string, file: string): Recorder {
  return {
    name: 'developer',
    async run(client) {
      const html = await client.request({ url: developerUrl(devId, 'en', 'us') });
      await writeFixture(file, html);
    },
  };
}

function similarRecorder(appId: string, detailsFile: string, clusterFile: string): Recorder {
  return {
    name: 'similar',
    async run(client) {
      const detailsHtml = await client.request({ url: similarDetailsUrl(appId, 'us') });
      await writeFixture(detailsFile, detailsHtml);

      const clusterPath = findSimilarClusterPath(parseScriptData(detailsHtml));
      if (clusterPath === undefined) {
        throw new Error(`no similar cluster found for "${appId}"`);
      }
      const clusterHtml = await client.request({
        url: similarClusterUrl(clusterPath, 'en', 'us'),
      });
      await writeFixture(clusterFile, clusterHtml);
    },
  };
}

const recorders: Recorder[] = [
  appPageRecorder('com.google.android.apps.translate', 'app/translate.html'),
  appPageRecorder('com.mojang.minecraftpe', 'app/minecraft.html'),
  appPageRecorder('com.adex77.WhereAmI', 'app/whereami.html'),
  searchHtmlRecorder('panda', 'search/panda.html'),
  searchHtmlRecorder('where am i', 'search/where-am-i.html'),
  suggestRecorder('pand', 'suggest/pand.txt'),
  listRecorder('TOP_FREE', 'GAME', 100, 'list/topfree-game.txt'),
  developerRecorder('5700313618786177705', 'developer/google.html'),
  developerRecorder('Mojang', 'developer/mojang.html'),
  similarRecorder(
    'com.google.android.apps.translate',
    'similar/translate-details.html',
    'similar/translate-cluster.html',
  ),
];

async function main(): Promise<void> {
  const [, , requested] = process.argv;
  const selected = requested
    ? recorders.filter((recorder) => recorder.name === requested)
    : recorders;

  if (selected.length === 0) {
    throw new Error(`no fixture recorder registered under "${requested ?? ''}"`);
  }

  const client = createHttpClient({ throttle: THROTTLE_REQUESTS_PER_SECOND });
  for (const recorder of selected) {
    await recorder.run(client);
  }
}

main().catch((error: unknown) => {
  process.exitCode = 1;
  throw error;
});
