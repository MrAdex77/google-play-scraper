import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL } from '../src/constants.ts';
import { buildBatchBody, parseBatchResponse } from '../src/core/batchexecute.ts';
import { createHttpClient, type HttpClient } from '../src/core/http.ts';
import { fetchDeveloperFirstPage } from '../src/features/developer/developer.ts';
import { buildSuggestPayload, SUGGEST_RPC_ID, suggestUrl } from '../src/features/suggest/specs.ts';
import { buildListBody, CLUSTER_NAMES, listUrl } from '../src/features/list/specs.ts';
import { category, collection, device, sort, type Device } from '../src/constants.ts';
import { developerUrl } from '../src/features/developer/specs.ts';
import { fetchSimilarFirstPage } from '../src/features/similar/similar.ts';
import {
  findSimilarClusterPath,
  PAGINATION_MAPPINGS,
  similarClusterUrl,
  similarDetailsUrl,
} from '../src/features/similar/specs.ts';
import {
  buildReviewsBody,
  REVIEWS_RESPONSE_PATHS,
  REVIEWS_RPC_ID,
  reviewsUrl,
} from '../src/features/reviews/specs.ts';
import { buildPermissionsBody, permissionsUrl } from '../src/features/permissions/specs.ts';
import { getPath } from '../src/core/path.ts';
import {
  buildClusterBody,
  CLUSTER_PAGE_SIZE,
  CLUSTER_RPC_ID,
  clusterUrl,
} from '../src/core/pagination.ts';
import { parseScriptData } from '../src/core/scriptData.ts';

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

interface Storefront {
  country: string;
  lang: string;
}

const DEFAULT_STOREFRONT: Storefront = { country: 'us', lang: 'en' };

function searchUrl(term: string, storefront: Storefront): string {
  const params = new URLSearchParams({
    c: 'apps',
    q: term,
    hl: storefront.lang,
    gl: storefront.country,
    price: '0',
  });
  return `${BASE_URL}/store/search?${params.toString()}`;
}

function searchHtmlRecorder(
  term: string,
  file: string,
  storefront: Storefront = DEFAULT_STOREFRONT,
): Recorder {
  return {
    name: 'search',
    async run(client) {
      const html = await client.request({ url: searchUrl(term, storefront) });
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

interface DeveloperContinuationRecording {
  devId: string;
  firstPageFile?: string;
  continuationFile: string;
}

function developerContinuationRecorder(recording: DeveloperContinuationRecording): Recorder {
  const { devId } = recording;
  return {
    name: 'developer-continuation',
    async run(client) {
      const html = await client.request({ url: developerUrl(devId, 'en', 'us') });
      if (recording.firstPageFile !== undefined) {
        await writeFixture(recording.firstPageFile, html);
      }

      const replay: HttpClient = { request: () => Promise.resolve(html) };
      const { token } = await fetchDeveloperFirstPage(
        { devId, lang: 'en', country: 'us', throttle: THROTTLE_REQUESTS_PER_SECOND },
        () => replay,
      );
      if (token === undefined) {
        throw new Error(`no developer continuation token for "${devId}"`);
      }

      const response = await client.request({
        url: clusterUrl('en', 'us'),
        method: 'POST',
        body: buildClusterBody(CLUSTER_PAGE_SIZE, token),
      });
      await writeFixture(recording.continuationFile, response);
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

const SIMILAR_CONTINUATION_REQUEST_LIMIT = 10;
const SIMILAR_TOKEN_NODE_PATH = PAGINATION_MAPPINGS.token.slice(0, -1);

function endsOnNullTokenNode(payload: unknown): boolean {
  const apps = getPath(payload, PAGINATION_MAPPINGS.apps);
  return (
    getPath(payload, SIMILAR_TOKEN_NODE_PATH) === null && Array.isArray(apps) && apps.length > 0
  );
}

function similarContinuationRecorder(appId: string, file: string): Recorder {
  return {
    name: 'similar-continuation',
    async run(client) {
      const query = { appId, lang: 'en', country: 'us' };
      let { token } = await fetchSimilarFirstPage(query, () => client);
      for (let request = 0; request < SIMILAR_CONTINUATION_REQUEST_LIMIT; request += 1) {
        if (token === undefined) {
          break;
        }
        const text = await client.request({
          url: clusterUrl('en', 'us'),
          method: 'POST',
          body: buildClusterBody(CLUSTER_PAGE_SIZE, token),
        });
        const payload = parseBatchResponse(text, CLUSTER_RPC_ID);
        const next = getPath(payload, PAGINATION_MAPPINGS.token);
        if (typeof next !== 'string') {
          if (!endsOnNullTokenNode(payload)) {
            throw new Error(`the final page for "${appId}" has no null token node, re-anchor it`);
          }
          await writeFixture(file, text);
          return;
        }
        token = next;
      }
      throw new Error(`no final continuation page for "${appId}"`);
    },
  };
}

interface ReviewsRecording {
  name: string;
  appId: string;
  count: number;
  score?: number;
  device?: Device;
  initialFile: string;
  page2File?: string;
}

function reviewsRecorder(recording: ReviewsRecording): Recorder {
  const request = {
    appId: recording.appId,
    sort: sort.NEWEST,
    count: recording.count,
    score: recording.score,
    device: recording.device,
  };
  return {
    name: recording.name,
    async run(client) {
      const initialText = await client.request({
        url: reviewsUrl('en', 'us'),
        method: 'POST',
        body: buildReviewsBody(request),
      });
      await writeFixture(recording.initialFile, initialText);
      if (recording.page2File === undefined) {
        return;
      }

      const payload = parseBatchResponse(initialText, REVIEWS_RPC_ID);
      const token = getPath(payload, REVIEWS_RESPONSE_PATHS.token);
      if (typeof token !== 'string') {
        throw new Error(`no reviews pagination token for "${recording.appId}"`);
      }

      const page2Text = await client.request({
        url: reviewsUrl('en', 'us'),
        method: 'POST',
        body: buildReviewsBody({ ...request, token }),
      });
      await writeFixture(recording.page2File, page2Text);
    },
  };
}

function permissionsRecorder(appId: string, file: string): Recorder {
  return {
    name: 'permissions',
    async run(client) {
      const response = await client.request({
        url: permissionsUrl('en', 'us'),
        method: 'POST',
        body: buildPermissionsBody(appId),
      });
      await writeFixture(file, response);
    },
  };
}

function dataSafetyRecorder(appId: string, file: string): Recorder {
  return {
    name: 'datasafety',
    async run(client) {
      const params = new URLSearchParams({ id: appId, hl: 'en' });
      const html = await client.request({
        url: `${BASE_URL}/store/apps/datasafety?${params.toString()}`,
      });
      await writeFixture(file, html);
    },
  };
}

const SYNTHETIC_DETAILS_LIKE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>details-like</title>
  </head>
  <body>
    <script nonce="a">AF_initDataCallback({key: 'ds:4', hash: '1', data:[["from-ds4"]], sideChannel: {}});</script>
    <script nonce="b">AF_initDataCallback({key: 'ds:5', hash: '2', data:[[["Panda App"], ["com.panda.app"]], [null, "5,000,000+"], {"nested": {"deep": "value"}}], sideChannel: {}});</script>
    <script nonce="c">AF_initDataCallback({key: 'ds:9', hash: '3', data:[oops not valid json], sideChannel: {}});</script>
    <script nonce="e">var somePrefix = 1; var AF_dataServiceRequests = {'ds:4': {id: 'rpcFour', request: [[null]]}, 'ds:5': {id: 'rpcFive', request: [[null]]}}; var AF_initDataChunkQueue = [];</script>
  </body>
</html>
`;

const SYNTHETIC_BATCH_CHUNKED = String.raw`)]}'

347
[["wrb.fr","rpcChunk","[[\"suggestion-one\"],[\"suggestion-two\"]]",null,null,null,"generic"],["di",42],["af.httprm",42,"c",13]]
26
[["e",4,null,null,131]]
`;

function syntheticRecorder(file: string, content: string): Recorder {
  return {
    name: 'synthetic',
    async run() {
      await writeFixture(file, content);
    },
  };
}

const recorders: Recorder[] = [
  appPageRecorder('com.google.android.apps.translate', 'app/translate.html'),
  appPageRecorder('com.mojang.minecraftpe', 'app/minecraft.html'),
  appPageRecorder('com.adex77.WhereAmI', 'app/whereami.html'),
  searchHtmlRecorder('panda', 'search/panda.html'),
  searchHtmlRecorder('where am i', 'search/where-am-i.html'),
  searchHtmlRecorder('biedronka', 'search/biedronka-pl.html', { country: 'pl', lang: 'pl' }),
  suggestRecorder('pand', 'suggest/pand.txt'),
  listRecorder('TOP_FREE', 'GAME', 100, 'list/topfree-game.txt'),
  developerRecorder('5700313618786177705', 'developer/google.html'),
  developerRecorder('Mojang', 'developer/mojang.html'),
  developerContinuationRecorder({
    devId: '5700313618786177705',
    continuationFile: 'developer/google-continuation.txt',
  }),
  developerContinuationRecorder({
    devId: 'Google LLC',
    firstPageFile: 'developer/google-name.html',
    continuationFile: 'developer/google-name-continuation.txt',
  }),
  similarRecorder(
    'com.google.android.apps.translate',
    'similar/translate-details.html',
    'similar/translate-cluster.html',
  ),
  similarContinuationRecorder('com.tencent.mhadv', 'similar/mhadv-continuation-last.txt'),
  reviewsRecorder({
    name: 'reviews',
    appId: 'com.google.android.apps.translate',
    count: 150,
    initialFile: 'reviews/translate-initial.txt',
    page2File: 'reviews/translate-page2.txt',
  }),
  reviewsRecorder({
    name: 'reviews-filtered',
    appId: 'com.google.android.apps.translate',
    count: 10,
    score: 5,
    initialFile: 'reviews/translate-score5-size10-initial.txt',
    page2File: 'reviews/translate-score5-size10-page2.txt',
  }),
  reviewsRecorder({
    name: 'reviews-filtered',
    appId: 'com.google.android.apps.translate',
    count: 10,
    device: device.TABLET,
    initialFile: 'reviews/translate-tablet-size10.txt',
  }),
  permissionsRecorder('com.google.android.apps.translate', 'permissions/translate.txt'),
  dataSafetyRecorder('com.google.android.apps.translate', 'datasafety/translate.html'),
  syntheticRecorder('synthetic/details-like.html', SYNTHETIC_DETAILS_LIKE_HTML),
  syntheticRecorder('synthetic/batch-chunked.txt', SYNTHETIC_BATCH_CHUNKED),
];

function parseRequestedName(args: readonly string[]): string | undefined {
  const onlyIndex = args.indexOf('--only');
  if (onlyIndex !== -1) {
    return args[onlyIndex + 1];
  }
  return args[0];
}

async function main(): Promise<void> {
  const requested = parseRequestedName(process.argv.slice(2));
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
