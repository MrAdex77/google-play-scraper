import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { permissions, type PermissionsOptions } from './permissions.js';
import { mapPermissions } from './specs.js';
import { permissionSchema, type AppPermission } from './schema.js';
import { permission } from '../../constants.js';
import { ValidationError } from '../../core/errors.js';

const TRANSLATE = 'com.google.android.apps.translate';

const fixture = readFileSync(
  fileURLToPath(new URL('../../../test/fixtures/permissions/translate.txt', import.meta.url)),
  'utf8',
);

const NULL_RESPONSE = `)]}'\n[["wrb.fr","xdSrCf",null,null,null,null,"1"]]`;

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

  it('returns deduplication-free permission strings when short', async () => {
    const full = (await permissions({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(fixture) },
    })) as AppPermission[];

    const short = (await permissions({
      appId: TRANSLATE,
      short: true,
      requestOptions: { fetchImpl: fetchReturning(fixture) },
    })) as string[];

    const commonStrings = full
      .filter((entry) => entry.type === permission.COMMON)
      .map((entry) => entry.permission);

    expect(short).toEqual(commonStrings);
    expect(short.length).toBeGreaterThan(3);
    for (const name of short) {
      expect(typeof name).toBe('string');
    }
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
      { permission: 'read contacts', type: permission.OTHER },
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
      { permission: 'camera access', type: permission.COMMON },
    ]);
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
});
