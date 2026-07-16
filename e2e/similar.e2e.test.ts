import { expect, it } from 'vitest';
import { type DegradationEvent, type SimilarApp } from '../src/index.js';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.js';

liveDescribe('similar live contract', () => {
  it('returns similar games for the Where Am I geography game', async () => {
    const sourceAppId = 'com.adex77.WhereAmI';
    const items = (await liveClient.similar({ appId: sourceAppId })) as SimilarApp[];

    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.appId === sourceAppId)).toBe(false);
    for (const item of items) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
      expect(new URL(item.url).origin).toBe('https://play.google.com');
    }
  });

  it('returns related apps that exclude the source app', async () => {
    const sourceAppId = 'com.google.android.apps.translate';
    const events: DegradationEvent[] = [];
    const items = (await liveClient.similar({
      appId: sourceAppId,
      onDegradation: (event) => events.push(event),
    })) as SimilarApp[];

    expect(items.length).toBeGreaterThanOrEqual(60);
    expect(items.some((item) => item.appId === sourceAppId)).toBe(false);
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);

    for (const item of items) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
      expect(new URL(item.url).origin).toBe('https://play.google.com');
      expect(typeof item.free).toBe('boolean');
    }

    expectFieldCoverage('similar', items, {
      score: 0.8,
      scoreText: 0.8,
      summary: 0.8,
    });
    expect(events).toEqual([]);
  });
});
