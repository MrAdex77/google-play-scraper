import { expect, it } from 'vitest';
import { parseBatchResponse } from '../src/core/batchexecute.ts';
import { clientFromOptions } from '../src/core/http.ts';
import {
  buildClusterBody,
  CLUSTER_PAGE_SIZE,
  CLUSTER_RPC_ID,
  clusterUrl,
} from '../src/core/pagination.ts';
import { getPath } from '../src/core/path.ts';
import { fetchSimilarFirstPage, type SimilarQuery } from '../src/features/similar/similar.ts';
import { PAGINATION_MAPPINGS, SIMILAR_MAX_APPS } from '../src/features/similar/specs.ts';
import { NotFoundError, type DegradationEvent, type SimilarApp } from '../src/index.ts';
import {
  expectAppItemsContract,
  expectContinuationContract,
  expectOfferAgreement,
} from './contracts.ts';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.ts';

const FLAGSHIP_APP_ID = 'com.google.android.apps.translate';
const FLAGSHIP_QUERY: SimilarQuery = {
  appId: FLAGSHIP_APP_ID,
  lang: 'en',
  country: 'us',
  throttle: 1,
};

const SPARSE_APP_ID = 'com.tencent.mhadv';
const SPARSE_QUERY: SimilarQuery = {
  appId: SPARSE_APP_ID,
  lang: 'en',
  country: 'us',
  throttle: 1,
};
const TOKEN_NODE_PATH = PAGINATION_MAPPINGS.token.slice(0, -1);

const GAME_APP_ID = 'com.miHoYo.GenshinImpact';
const GERMAN_STOREFRONT = { country: 'de', lang: 'de' } as const;
const PRICED_SAMPLE_SIZE = 4;
const FREE_SAMPLE_SIZE = 2;

function describeTokenNode(tokenNode: unknown): string {
  if (tokenNode === null) {
    return 'ends on a null token node';
  }
  if (tokenNode === undefined) {
    return 'ends without a token node';
  }
  return 'carries a token node to a further page';
}

liveDescribe('similar live contract', () => {
  it('returns a well formed cluster for the Where Am I geography game', async ({ annotate }) => {
    const sourceAppId = 'com.adex77.WhereAmI';
    const items = (await liveClient.similar({ appId: sourceAppId })) as SimilarApp[];

    expectAppItemsContract(items, 'geography game similar cluster');
    expect(items.some((item) => item.appId === sourceAppId)).toBe(false);
    expect(items.length).toBeLessThanOrEqual(SIMILAR_MAX_APPS);

    await annotate(
      `${sourceAppId} is recommended alongside ${items.length.toString()} apps`,
      'notice',
    );
  });

  it('follows the cluster continuation for a flagship source app', async () => {
    const events: DegradationEvent[] = [];
    const { apps, token } = await fetchSimilarFirstPage(FLAGSHIP_QUERY, clientFromOptions);

    const items = (await liveClient.similar({
      appId: FLAGSHIP_APP_ID,
      onDegradation: (event) => events.push(event),
    })) as SimilarApp[];

    expectContinuationContract(
      { firstPageCount: apps.length, token },
      items.length,
      SIMILAR_MAX_APPS,
      'flagship similar cluster',
    );
    expect(items.some((item) => item.appId === FLAGSHIP_APP_ID)).toBe(false);
    expectAppItemsContract(items, 'flagship similar cluster');

    expectFieldCoverage('similar', items, {
      score: 0.8,
      scoreText: 0.8,
      summary: 0.8,
    });
    expect(events).toEqual([]);
  });

  it('follows a sparse cluster to its end without a degradation event', async ({ annotate }) => {
    const events: DegradationEvent[] = [];
    const { client, apps, token } = await fetchSimilarFirstPage(SPARSE_QUERY, clientFromOptions);
    expect(
      token,
      'the sparse anchor must still carry a continuation token on its first page',
    ).toBeDefined();

    const continuationPage = parseBatchResponse(
      await client.request({
        url: clusterUrl(SPARSE_QUERY.lang, SPARSE_QUERY.country),
        method: 'POST',
        body: buildClusterBody(CLUSTER_PAGE_SIZE, token ?? ''),
      }),
      CLUSTER_RPC_ID,
    );
    await annotate(
      `${SPARSE_APP_ID} continuation page ${describeTokenNode(getPath(continuationPage, TOKEN_NODE_PATH))}`,
      'notice',
    );

    const items = (await liveClient.similar({
      appId: SPARSE_APP_ID,
      onDegradation: (event) => events.push(event),
    })) as SimilarApp[];

    expect(events).toEqual([]);
    expectContinuationContract(
      { firstPageCount: apps.length, token },
      items.length,
      SIMILAR_MAX_APPS,
      'sparse similar cluster',
    );
    expect(items.some((item) => item.appId === SPARSE_APP_ID)).toBe(false);
    expectAppItemsContract(items, 'sparse similar cluster');
  });

  it('agrees with the app details on continuation offers in a comma decimal storefront', async () => {
    const events: DegradationEvent[] = [];
    const { apps } = await fetchSimilarFirstPage(
      { appId: GAME_APP_ID, ...GERMAN_STOREFRONT, throttle: 1 },
      clientFromOptions,
    );

    const items = (await liveClient.similar({
      appId: GAME_APP_ID,
      ...GERMAN_STOREFRONT,
      onDegradation: (event) => events.push(event),
    })) as SimilarApp[];

    expect(events, 'the german game cluster degraded').toEqual([]);
    expect(items.length, 'the german game cluster lost its continuation page').toBeGreaterThan(
      apps.length,
    );
    expectAppItemsContract(items, 'german game similar cluster');

    const continuation = items.slice(apps.length);
    const priced = continuation.filter((item) => item.currency !== undefined);
    const free = continuation.filter((item) => item.currency === undefined);
    const sample = [...priced.slice(0, PRICED_SAMPLE_SIZE), ...free.slice(0, FREE_SAMPLE_SIZE)];
    for (const item of sample) {
      const listing = await liveClient.app({ appId: item.appId, ...GERMAN_STOREFRONT });
      expectOfferAgreement(item, listing, 'german game similar continuation');
    }
  });

  it('rejects a nonexistent source app with a NotFoundError', async () => {
    await expect(
      liveClient.similar({ appId: 'com.adex77.definitely.not.a.real.app' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
