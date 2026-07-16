import { expect, it } from 'vitest';
import { createClient, type SearchResult } from '../src/index.js';
import { liveClient, liveDescribe } from './helpers.js';

const TRANSLATE = 'com.google.android.apps.translate';

liveDescribe('createClient live contract', () => {
  it('runs app and search through one shared client', async () => {
    const details = await liveClient.app({ appId: TRANSLATE });
    expect(details.appId).toBe(TRANSLATE);
    expect(details.title.length).toBeGreaterThan(0);

    const results = (await liveClient.search({ term: 'where am i', num: 5 })) as SearchResult[];
    expect(results.length).toBeGreaterThan(0);
    for (const item of results) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(new URL(item.url).origin).toBe('https://play.google.com');
    }
  });

  it('applies the client country default to app requests', async () => {
    const client = createClient({ country: 'pl', throttle: 1 });
    const details = await client.app({ appId: TRANSLATE });

    expect(details.appId).toBe(TRANSLATE);
    expect(details.url).toContain('gl=pl');
  });
});
