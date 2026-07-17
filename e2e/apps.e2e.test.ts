import { expect, it } from 'vitest';
import { NotFoundError } from '../src/index.js';
import { liveClient, liveDescribe } from './helpers.js';

const TRANSLATE_ID = 'com.google.android.apps.translate';
const INSTAGRAM_ID = 'com.instagram.android';
const GEO_GAME_ID = 'com.adex77.WhereAmI';
const STABLE_IDS = [TRANSLATE_ID, INSTAGRAM_ID, GEO_GAME_ID];

liveDescribe('apps live contract', () => {
  it('fetches a batch of stable ids in order', async () => {
    const result = await liveClient.apps({ appIds: STABLE_IDS, concurrency: 2 });

    expect(result.map((entry) => entry.appId)).toEqual(STABLE_IDS);
    for (const entry of result) {
      expect(entry.status).toBe('fulfilled');
      if (entry.status === 'fulfilled') {
        expect(entry.app.appId).toBe(entry.appId);
        expect(entry.app.title.length).toBeGreaterThan(0);
      }
    }
  });

  it('rejects every entry in order when no id exists', async () => {
    const missingIds = ['com.adex77.definitely.not.a.real.app', 'com.adex77.also.not.real'];
    const result = await liveClient.apps({ appIds: missingIds, concurrency: 2 });

    expect(result.map((entry) => entry.appId)).toEqual(missingIds);
    for (const entry of result) {
      expect(entry.status).toBe('rejected');
      if (entry.status === 'rejected') {
        expect(entry.error).toBeInstanceOf(NotFoundError);
      }
    }
  });

  it('rejects only the missing id while the rest fulfill', async () => {
    const missingId = 'com.adex77.definitely.not.a.real.app';
    const result = await liveClient.apps({
      appIds: [TRANSLATE_ID, missingId, GEO_GAME_ID],
      concurrency: 2,
    });

    expect(result[0]?.status).toBe('fulfilled');
    expect(result[2]?.status).toBe('fulfilled');

    const missing = result[1];
    expect(missing?.appId).toBe(missingId);
    expect(missing?.status).toBe('rejected');
    if (missing?.status === 'rejected') {
      expect(missing.error).toBeInstanceOf(NotFoundError);
    }
  });
});
