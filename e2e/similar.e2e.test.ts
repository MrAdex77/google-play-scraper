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
import { expectAppItemsContract, expectContinuationContract } from './contracts.ts';
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

  it('keeps the final continuation page when google serves a null token node', async () => {
    const events: DegradationEvent[] = [];
    const { apps, token } = await fetchSimilarFirstPage(SPARSE_QUERY, clientFromOptions);
    expect(
      token,
      'the sparse anchor must still carry a continuation token on its first page',
    ).toBeDefined();

    const finalPage = parseBatchResponse(
      await clientFromOptions(SPARSE_QUERY).request({
        url: clusterUrl(SPARSE_QUERY.lang, SPARSE_QUERY.country),
        method: 'POST',
        body: buildClusterBody(CLUSTER_PAGE_SIZE, token ?? ''),
      }),
      CLUSTER_RPC_ID,
    );
    expect(
      getPath(finalPage, TOKEN_NODE_PATH),
      'the sparse anchor must still end on a null token node, re-anchor this probe',
    ).toBeNull();
    const finalApps = getPath(finalPage, PAGINATION_MAPPINGS.apps);
    expect(Array.isArray(finalApps) ? finalApps.length : 0).toBeGreaterThan(0);

    const items = (await liveClient.similar({
      appId: SPARSE_APP_ID,
      onDegradation: (event) => events.push(event),
    })) as SimilarApp[];

    expect(events).toEqual([]);
    expect(items.length).toBeGreaterThan(apps.length);
    expect(items.length).toBeLessThanOrEqual(SIMILAR_MAX_APPS);
    expectAppItemsContract(items, 'sparse similar cluster');
  });

  it('rejects a nonexistent source app with a NotFoundError', async () => {
    await expect(
      liveClient.similar({ appId: 'com.adex77.definitely.not.a.real.app' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
