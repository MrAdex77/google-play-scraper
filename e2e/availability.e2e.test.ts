import { expect, it } from 'vitest';
import { liveClient, liveDescribe } from './helpers.js';

const GEO_GAME_ID = 'com.adex77.WhereAmI';

liveDescribe('availability live contract', () => {
  it('reports the canonical app as available in us and pl', async () => {
    const result = await liveClient.availability({
      appId: GEO_GAME_ID,
      countries: ['us', 'pl'],
    });

    expect(result.appId).toBe(GEO_GAME_ID);
    expect(result.countries.us).toEqual({ status: 'available' });
    expect(result.countries.pl).toEqual({ status: 'available' });
  });

  it('reports a nonsense app as unavailable in every probed country', async () => {
    const result = await liveClient.availability({
      appId: 'com.adex77.definitely.not.a.real.app',
      countries: ['us', 'pl', 'de'],
    });

    for (const country of ['us', 'pl', 'de'] as const) {
      expect(result.countries[country]).toEqual({ status: 'unavailable' });
    }
  });
});
