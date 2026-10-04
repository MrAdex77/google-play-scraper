import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { permissions, type PermissionsOptions } from './permissions.ts';
import { mapPermissions } from './specs.ts';
import { permissionSchema, type AppPermission } from './schema.ts';
import { permission } from '../../constants.ts';
import { ParseError, ValidationError } from '../../core/errors.ts';

const TRANSLATE = 'com.google.android.apps.translate';

const permissionEntriesSchema = z.array(permissionSchema);
const permissionNamesSchema = z.array(z.string());

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/permissions/${name}.txt`, import.meta.url)),
    'utf8',
  );

const fixture = readFixture('translate');

const NULL_RESPONSE = `)]}'\n[["wrb.fr","xdSrCf",null,null,null,null,"1"]]`;

const permissionsBatch = (payload: unknown): string => {
  const frame = [['wrb.fr', 'xdSrCf', JSON.stringify(payload), null, null, null, '1']];
  return `)]}'\n${JSON.stringify(frame)}`;
};

const fetchReturning =
  (body: string): typeof fetch =>
  () =>
    Promise.resolve(new Response(body, { status: 200 }));

describe('permissions fixture parsing', () => {
  it('maps the fixture into typed permission entries', async () => {
    const result = (await permissions({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(fixture) },
    })) as AppPermission[];

    expect(result.length).toBeGreaterThan(3);
    const types = new Set(result.map((entry) => entry.type));
    expect(types).toEqual(new Set([permission.COMMON, permission.OTHER]));

    for (const entry of result) {
      expect(() => permissionSchema.parse(entry)).not.toThrow();
      expect(typeof entry.permission).toBe('string');
      expect(entry.permission.length).toBeGreaterThan(0);
      expect([permission.COMMON, permission.OTHER]).toContain(entry.type);
    }
  });

  it('returns each common permission string once when short', async () => {
    const full = permissionEntriesSchema.parse(
      await permissions({
        appId: TRANSLATE,
        requestOptions: { fetchImpl: fetchReturning(fixture) },
      }),
    );

    const short = permissionNamesSchema.parse(
      await permissions({
        appId: TRANSLATE,
        short: true,
        requestOptions: { fetchImpl: fetchReturning(fixture) },
      }),
    );

    const commonStrings = full
      .filter((entry) => entry.type === permission.COMMON)
      .map((entry) => entry.permission);

    expect(commonStrings).toHaveLength(11);
    expect(short).toEqual([...new Set(commonStrings)]);
    expect(short).toHaveLength(8);
  });
});

describe('permissions short output across recorded listings', () => {
  const shortFor = async (name: string): Promise<string[]> =>
    permissionNamesSchema.parse(
      await permissions({
        appId: 'com.example.app',
        short: true,
        requestOptions: { fetchImpl: fetchReturning(readFixture(name)) },
      }),
    );

  it('lists a permission shared by two groups once, keeping first seen order', async () => {
    const short = await shortFor('whatsapp');

    expect(short).toHaveLength(18);
    expect(new Set(short).size).toBe(short.length);
    expect(short.filter((name) => name === 'read the contents of your USB storage')).toHaveLength(
      1,
    );
    expect(short.indexOf('read the contents of your USB storage')).toBeLessThan(
      short.indexOf('modify or delete the contents of your USB storage'),
    );
  });

  it('removes duplicates in a localized storefront', async () => {
    const short = await shortFor('translate-ja');

    expect(short).toHaveLength(5);
    expect(new Set(short).size).toBe(5);
  });

  it('removes duplicates when only the common section exists', async () => {
    expect(await shortFor('common-only')).toHaveLength(2);
  });

  it('returns nothing for an app that declares only other permissions', async () => {
    expect(await shortFor('other-only')).toEqual([]);
  });

  it('returns nothing for an app that declares no permissions', async () => {
    expect(await shortFor('none')).toEqual([]);
  });
});

describe('mapPermissions fallbacks', () => {
  it('returns nothing for a non array payload', () => {
    expect(mapPermissions('nope')).toEqual([]);
    expect(mapPermissions(undefined)).toEqual([]);
  });

  it('skips sections that are not arrays', () => {
    const payload: unknown[] = [];
    payload[permission.COMMON] = 'not-a-section';
    payload[permission.OTHER] = [[null, null, [[null, 'read contacts']]]];

    expect(mapPermissions(payload)).toEqual([
      { permission: 'read contacts', type: permission.OTHER, group: '' },
    ]);
  });

  it('keeps the group name of every entry and falls back to an empty name', () => {
    const payload: unknown[] = [];
    payload[permission.COMMON] = [
      ['Camera', null, [[null, 'take pictures and videos']]],
      [42, null, [[null, 'record audio']]],
      [null, null, [[null, 'read contacts']]],
    ];

    expect(mapPermissions(payload)).toEqual([
      { permission: 'take pictures and videos', type: permission.COMMON, group: 'Camera' },
      { permission: 'record audio', type: permission.COMMON, group: '' },
      { permission: 'read contacts', type: permission.COMMON, group: '' },
    ]);
  });

  it('keeps a permission once per group that lists it', () => {
    const payload: unknown[] = [];
    payload[permission.COMMON] = [
      ['Photos/Media/Files', null, [[null, 'read the contents of your USB storage']]],
      ['Storage', null, [[null, 'read the contents of your USB storage']]],
    ];

    expect(mapPermissions(payload)).toEqual([
      {
        permission: 'read the contents of your USB storage',
        type: permission.COMMON,
        group: 'Photos/Media/Files',
      },
      {
        permission: 'read the contents of your USB storage',
        type: permission.COMMON,
        group: 'Storage',
      },
    ]);
  });

  it('skips groups without a permission list and entries without text', () => {
    const payload: unknown[] = [];
    payload[permission.COMMON] = [
      [null, null, 'not-a-list'],
      [
        null,
        null,
        [
          [null, ''],
          [null, 'camera access'],
          [null, 42],
        ],
      ],
    ];

    expect(mapPermissions(payload)).toEqual([
      { permission: 'camera access', type: permission.COMMON, group: '' },
    ]);
  });
});

describe('permissions group field', () => {
  const entriesFor = async (name: string): Promise<AppPermission[]> =>
    permissionEntriesSchema.parse(
      await permissions({
        appId: 'com.example.app',
        requestOptions: { fetchImpl: fetchReturning(readFixture(name)) },
      }),
    );

  const groupsOf = (entries: AppPermission[], text: string): string[] =>
    entries.filter((entry) => entry.permission === text).map((entry) => entry.group);

  it('names the group of every entry on a listing with shared permissions', async () => {
    const entries = await entriesFor('whatsapp');

    expect(entries).toHaveLength(41);
    for (const entry of entries) {
      expect(entry.group.length).toBeGreaterThan(0);
      expect(() => permissionSchema.parse(entry)).not.toThrow();
    }
    expect(groupsOf(entries, 'read the contents of your USB storage')).toEqual([
      'Photos/Media/Files',
      'Storage',
    ]);
    expect(groupsOf(entries, 'find accounts on the device')).toEqual(['Identity', 'Contacts']);
  });

  it('keeps every group and permission pair unique', async () => {
    const entries = await entriesFor('whatsapp');
    const pairs = entries.map((entry) => `${entry.group}\u0000${entry.permission}`);

    expect(new Set(pairs).size).toBe(entries.length);
  });

  it('puts the other section under a single group', async () => {
    const entries = await entriesFor('whatsapp');
    const otherGroups = new Set(
      entries.filter((entry) => entry.type === permission.OTHER).map((entry) => entry.group),
    );

    expect(otherGroups).toEqual(new Set(['Other']));
  });

  it('returns the group name of the requested storefront language', async () => {
    const german = await entriesFor('whatsapp-de');
    const japanese = await entriesFor('translate-ja');

    expect(new Set(german.filter((e) => e.type === permission.OTHER).map((e) => e.group))).toEqual(
      new Set(['Sonstiges']),
    );
    expect(groupsOf(german, 'USB-Speicherinhalte lesen')).toEqual([
      'Fotos/Medien/Dateien',
      'Speicher',
    ]);
    expect(japanese.map((entry) => entry.group)).toContain('カメラ');
  });

  it('names the single group of an app that only declares other permissions', async () => {
    const entries = await entriesFor('other-only');

    expect(entries).toHaveLength(6);
    expect(new Set(entries.map((entry) => entry.group))).toEqual(new Set(['Other']));
    expect(entries.every((entry) => entry.type === permission.OTHER)).toBe(true);
  });

  it('returns no entries for an app that declares no permissions', async () => {
    expect(await entriesFor('none')).toEqual([]);
  });

  it('names a group in both sections of the owned anchor', async () => {
    const entries = await entriesFor('where-am-i');

    expect(new Set(entries.map((entry) => entry.type))).toEqual(
      new Set([permission.COMMON, permission.OTHER]),
    );
    expect(entries.every((entry) => entry.group.length > 0)).toBe(true);
  });

  it('rejects an entry without a group in the result schema', () => {
    expect(() =>
      permissionSchema.parse({ permission: 'camera', type: permission.COMMON }),
    ).toThrow();
  });
});

describe('permissions guards', () => {
  it('rejects a missing appId with a ValidationError', async () => {
    await expect(permissions({} as PermissionsOptions)).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns an empty array when the payload is null', async () => {
    const result = await permissions({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(NULL_RESPONSE) },
    });

    expect(result).toEqual([]);
  });

  it('returns an empty array for an app that declares no permission sections', async () => {
    const result = await permissions({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(permissionsBatch([])) },
    });

    expect(result).toEqual([]);
  });

  it('rejects a payload whose permission section is not a collection', async () => {
    await expect(
      permissions({
        appId: TRANSLATE,
        requestOptions: { fetchImpl: fetchReturning(permissionsBatch(['not-a-section'])) },
      }),
    ).rejects.toBeInstanceOf(ParseError);
  });
});
