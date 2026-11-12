import { expect, it } from 'vitest';
import { legacyBatchUrl, parseBatchResponse } from '../src/core/batchexecute.ts';
import type { ResolveClient } from '../src/core/http.ts';
import { buildClusterBody, CLUSTER_PAGE_SIZE, CLUSTER_RPC_ID } from '../src/core/pagination.ts';
import { getPath } from '../src/core/path.ts';
import { app } from '../src/features/app/app.ts';
import {
  createSimilar,
  fetchSimilarFirstPage,
  narrowSimilar,
} from '../src/features/similar/similar.ts';
import { PAGINATION_MAPPINGS, SIMILAR_MAX_APPS } from '../src/features/similar/specs.ts';
import { NotFoundError, type DegradationEvent } from '../src/index.ts';
import { expectAppItemsContract, expectContinuationContract } from './contracts.ts';
import { expectFieldFilledOnEachPageShape } from './fieldPresence.ts';
import {
  expectDeveloperIdAgreesWithApp,
  expectListingOffersAgree,
  liveClient,
  liveDescribe,
  memoizingResolveClient,
  type Storefront,
} from './helpers.ts';
import {
  findSimilarContinuationAnchor,
  PAID_SIMILAR_CONTINUATION_ANCHORS,
  SIMILAR_CONTINUATION_ANCHORS,
  similarQueryFor,
  SPARSE_SIMILAR_ANCHORS,
} from './similarAnchors.ts';

const OWNED_APP_ID = 'com.adex77.WhereAmI';
const TOKEN_NODE_PATH = PAGINATION_MAPPINGS.token.slice(0, -1);

const GERMAN_STOREFRONT: Storefront = { country: 'de', lang: 'de' };

function describeTokenNode(tokenNode: unknown): string {
  if (tokenNode === null) {
    return 'ends on a null token node';
  }
  if (tokenNode === undefined) {
    return 'ends without a token node';
  }
  return 'carries a token node to a further page';
}

function similarThrough(resolveClient: ResolveClient) {
  return narrowSimilar(createSimilar(app, resolveClient));
}

function appIdsOf(items: readonly { appId: string }[]): Set<string> {
  return new Set(items.map((item) => item.appId));
}

liveDescribe('similar live contract', () => {
  it('returns the whole cluster of the Where Am I geography game', async ({ annotate }) => {
    const events: DegradationEvent[] = [];
    const resolveClient = memoizingResolveClient();
    const { apps, token } = await fetchSimilarFirstPage(
      similarQueryFor(OWNED_APP_ID),
      resolveClient,
    );

    const items = await similarThrough(resolveClient)({
      appId: OWNED_APP_ID,
      onDegradation: (event) => events.push(event),
    });

    expect(events).toEqual([]);
    expectAppItemsContract(items, 'geography game similar cluster');
    expect(items.some((item) => item.appId === OWNED_APP_ID)).toBe(false);
    expect(items.length).toBeLessThanOrEqual(SIMILAR_MAX_APPS);
    if (token === undefined) {
      expect(
        appIdsOf(items),
        'geography game similar cluster: a first page without a token must be the whole result',
      ).toEqual(appIdsOf(apps));
    }

    await annotate(
      `${OWNED_APP_ID} is recommended alongside ${items.length.toString()} apps, its first page ${token === undefined ? 'carries no token' : 'carries a token'}`,
      'notice',
    );
  });

  it('follows the cluster continuation for a flagship source app', async () => {
    const events: DegradationEvent[] = [];
    const resolveClient = memoizingResolveClient();
    const { query, apps, token } = await findSimilarContinuationAnchor(
      SIMILAR_CONTINUATION_ANCHORS,
      resolveClient,
    );
    const label = `${query.appId} similar cluster`;

    const items = await similarThrough(resolveClient)({
      appId: query.appId,
      onDegradation: (event) => events.push(event),
    });

    expectContinuationContract(
      { firstPageCount: apps.length, token },
      items.length,
      SIMILAR_MAX_APPS,
      label,
    );
    expect(items.some((item) => item.appId === query.appId)).toBe(false);
    expectAppItemsContract(items, label);

    expectFieldFilledOnEachPageShape(label, items, { firstPageCount: apps.length, token }, [
      'score',
      'scoreText',
      'summary',
    ]);
    await expectDeveloperIdAgreesWithApp(items.slice(apps.length), `${label} continuation`);
    expect(events).toEqual([]);
  });

  it('follows a sparse cluster to its end without a degradation event', async ({ annotate }) => {
    const events: DegradationEvent[] = [];
    const resolveClient = memoizingResolveClient();
    const { client, query, apps, token } = await findSimilarContinuationAnchor(
      SPARSE_SIMILAR_ANCHORS,
      resolveClient,
    );
    const label = `sparse ${query.appId} similar cluster`;
    const continuationPage = parseBatchResponse(
      await client.request({
        url: legacyBatchUrl(query.lang, query.country),
        method: 'POST',
        body: buildClusterBody(CLUSTER_PAGE_SIZE, token),
      }),
      CLUSTER_RPC_ID,
    );
    await annotate(
      `${query.appId} continuation page ${describeTokenNode(getPath(continuationPage, TOKEN_NODE_PATH))}`,
      'notice',
    );

    const items = await similarThrough(resolveClient)({
      appId: query.appId,
      onDegradation: (event) => events.push(event),
    });

    expect(events).toEqual([]);
    expectContinuationContract(
      { firstPageCount: apps.length, token },
      items.length,
      SIMILAR_MAX_APPS,
      label,
    );
    expect(items.some((item) => item.appId === query.appId)).toBe(false);
    expectAppItemsContract(items, label);
  });

  it('agrees with the app details on continuation offers in a comma decimal storefront', async () => {
    const events: DegradationEvent[] = [];
    const resolveClient = memoizingResolveClient();
    const { query, apps, token } = await findSimilarContinuationAnchor(
      PAID_SIMILAR_CONTINUATION_ANCHORS,
      resolveClient,
      GERMAN_STOREFRONT,
    );
    const label = `german ${query.appId} similar cluster`;

    const items = await similarThrough(resolveClient)({
      appId: query.appId,
      ...GERMAN_STOREFRONT,
      onDegradation: (event) => events.push(event),
    });

    expect(events, `${label} degraded`).toEqual([]);
    expectContinuationContract(
      { firstPageCount: apps.length, token },
      items.length,
      SIMILAR_MAX_APPS,
      label,
    );
    expectAppItemsContract(items, label);

    await expectListingOffersAgree(
      items.slice(apps.length),
      GERMAN_STOREFRONT,
      `${label} continuation`,
    );
  });

  it('rejects a nonexistent source app with a NotFoundError', async () => {
    await expect(
      liveClient.similar({ appId: 'com.adex77.definitely.not.a.real.app' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
