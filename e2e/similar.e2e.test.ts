import { describe, expect, it } from 'vitest';
import { similar, type SimilarApp } from '../src/index.js';

describe('similar live contract', () => {
  it('returns related apps that exclude the source app', async () => {
    const sourceAppId = 'com.google.android.apps.translate';
    const items = (await similar({ appId: sourceAppId })) as SimilarApp[];

    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.some((item) => item.appId === sourceAppId)).toBe(false);
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);

    for (const item of items) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.url.startsWith('https://play.google.com')).toBe(true);
      expect(typeof item.free).toBe('boolean');
    }
  });
});
