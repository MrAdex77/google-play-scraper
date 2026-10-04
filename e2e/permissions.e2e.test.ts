import { expect, it } from 'vitest';
import { permission, type AppPermission } from '../src/index.ts';
import { liveClient, liveDescribe } from './helpers.ts';

const TRANSLATE = 'com.google.android.apps.translate';
const WHATSAPP = 'com.whatsapp';
const WHERE_AM_I = 'com.adex77.WhereAmI';
const OTHER_ONLY_PREREGISTRATION = 'jp.kadokawa.gb.machisuba';

const uniqueCommonPermissions = (entries: readonly AppPermission[]): string[] => [
  ...new Set(
    entries.filter((entry) => entry.type === permission.COMMON).map((entry) => entry.permission),
  ),
];

liveDescribe('permissions live contract', () => {
  it('returns typed permission entries with common and other types', async () => {
    const result = await liveClient.permissions({ appId: TRANSLATE });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    for (const entry of result) {
      expect(typeof entry).toBe('object');
      const item = entry as AppPermission;
      expect(typeof item.permission).toBe('string');
      expect(item.permission.length).toBeGreaterThan(0);
      expect([permission.COMMON, permission.OTHER]).toContain(item.type);
      expect(typeof item.group).toBe('string');
      expect(item.group.length).toBeGreaterThan(0);
    }
  });

  it('returns entries from both permission sections for the Where Am I geography game', async () => {
    const result = await liveClient.permissions({ appId: WHERE_AM_I });
    const items = result as AppPermission[];

    for (const item of items) {
      expect(item.permission.length).toBeGreaterThan(0);
      expect(item.group.length).toBeGreaterThan(0);
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
      const item = entry as AppPermission;
      expect(item.permission.length).toBeGreaterThan(0);
      expect([permission.COMMON, permission.OTHER]).toContain(item.type);
      expect(item.group.length).toBeGreaterThan(0);
    }
  });

  it('returns each short permission once and in the order of the detailed entries', async () => {
    for (const appId of [TRANSLATE, WHATSAPP, WHERE_AM_I]) {
      const detailed = (await liveClient.permissions({ appId })) as AppPermission[];
      const short = (await liveClient.permissions({ appId, short: true })) as string[];

      expect(short.length, `${appId} declares common permissions`).toBeGreaterThan(0);
      expect(new Set(short).size, `${appId} short output repeats a permission`).toBe(short.length);
      expect(short, `${appId} short output drifted from the detailed entries`).toEqual(
        uniqueCommonPermissions(detailed),
      );
    }
  });

  it('names a group for every entry of a listing that spreads permissions over groups', async () => {
    const detailed = (await liveClient.permissions({ appId: WHATSAPP })) as AppPermission[];

    expect(detailed.length).toBeGreaterThan(0);
    for (const entry of detailed) {
      expect(typeof entry.group).toBe('string');
      expect(entry.group.length, `${entry.permission} has no group`).toBeGreaterThan(0);
    }
    const pairs = detailed.map((entry) => `${entry.group}\u0000${entry.permission}`);
    expect(new Set(pairs).size).toBe(detailed.length);
  });

  it('names every group of an other only listing and keeps short in step', async () => {
    const detailed = (await liveClient.permissions({
      appId: OTHER_ONLY_PREREGISTRATION,
    })) as AppPermission[];
    const short = (await liveClient.permissions({
      appId: OTHER_ONLY_PREREGISTRATION,
      short: true,
    })) as string[];

    expect(detailed.length).toBeGreaterThan(0);
    for (const entry of detailed) {
      expect(entry.group.length).toBeGreaterThan(0);
    }
    expect(short).toEqual(uniqueCommonPermissions(detailed));
  });

  it('returns an empty list instead of throwing for a missing app', async () => {
    const result = await liveClient.permissions({
      appId: 'com.adex77.definitely.not.a.real.app',
    });

    expect(result).toEqual([]);
  });
});
