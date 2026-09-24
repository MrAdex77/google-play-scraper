import { expect, it } from 'vitest';
import { permission } from '../src/index.ts';
import { liveClient, liveDescribe } from './helpers.ts';

const TRANSLATE = 'com.google.android.apps.translate';

liveDescribe('permissions live contract', () => {
  it('returns typed permission entries with common and other types', async () => {
    const result = await liveClient.permissions({ appId: TRANSLATE });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    for (const entry of result) {
      expect(typeof entry).toBe('object');
      const item = entry as { permission: string; type: number };
      expect(typeof item.permission).toBe('string');
      expect(item.permission.length).toBeGreaterThan(0);
      expect([permission.COMMON, permission.OTHER]).toContain(item.type);
    }
  });

  it('returns entries from both permission sections for the Where Am I geography game', async () => {
    const result = await liveClient.permissions({ appId: 'com.adex77.WhereAmI' });
    const items = result as { permission: string; type: number }[];

    for (const item of items) {
      expect(item.permission.length).toBeGreaterThan(0);
      expect([permission.COMMON, permission.OTHER]).toContain(item.type);
    }
    expect(
      new Set(items.map((item) => item.type)),
      'the owned listing declares common and other permissions, so an empty section means a section path drifted',
    ).toEqual(new Set([permission.COMMON, permission.OTHER]));
  });

  it('returns plain permission strings when short', async () => {
    const result = await liveClient.permissions({ appId: TRANSLATE, short: true });

    expect(result.length).toBeGreaterThan(0);
    for (const name of result) {
      expect(typeof name).toBe('string');
    }
  });

  it('returns localized permission names for a german storefront', async () => {
    const result = await liveClient.permissions({ appId: TRANSLATE, lang: 'de' });

    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      const item = entry as { permission: string; type: number };
      expect(item.permission.length).toBeGreaterThan(0);
      expect([permission.COMMON, permission.OTHER]).toContain(item.type);
    }
  });

  it('returns an empty list instead of throwing for a missing app', async () => {
    const result = await liveClient.permissions({
      appId: 'com.adex77.definitely.not.a.real.app',
    });

    expect(result).toEqual([]);
  });
});
