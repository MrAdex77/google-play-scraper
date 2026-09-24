import { expect, it } from 'vitest';
import { clientFromOptions } from '../src/core/http.ts';
import { fetchSimilarFirstPage, type SimilarQuery } from '../src/features/similar/similar.ts';
import { SIMILAR_MAX_APPS } from '../src/features/similar/specs.ts';
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

  it('rejects a nonexistent source app with a NotFoundError', async () => {
    await expect(
      liveClient.similar({ appId: 'com.adex77.definitely.not.a.real.app' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
