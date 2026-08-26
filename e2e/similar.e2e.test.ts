import { expect, it } from 'vitest';
import { SIMILAR_MAX_APPS } from '../src/features/similar/specs.js';
import { NotFoundError, type DegradationEvent, type SimilarApp } from '../src/index.js';
import { expectAppItemsContract } from './contracts.js';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.js';

const SIMILAR_CLUSTER_PAGE_SIZE = 50;

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
    const sourceAppId = 'com.google.android.apps.translate';
    const events: DegradationEvent[] = [];
    const items = (await liveClient.similar({
      appId: sourceAppId,
      onDegradation: (event) => events.push(event),
    })) as SimilarApp[];

    expect(items.length).toBeGreaterThan(SIMILAR_CLUSTER_PAGE_SIZE);
    expect(items.length).toBeLessThanOrEqual(SIMILAR_MAX_APPS);
    expect(items.some((item) => item.appId === sourceAppId)).toBe(false);
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
