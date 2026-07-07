import { describe, expect, it } from 'vitest';
import { permission, permissions } from '../src/index.js';

const TRANSLATE = 'com.google.android.apps.translate';

describe('permissions live contract', () => {
  it('returns typed permission entries with common and other types', async () => {
    const result = await permissions({ appId: TRANSLATE });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(3);

    for (const entry of result) {
      expect(typeof entry).toBe('object');
      const item = entry as { permission: string; type: number };
      expect(typeof item.permission).toBe('string');
      expect(item.permission.length).toBeGreaterThan(0);
      expect([permission.COMMON, permission.OTHER]).toContain(item.type);
    }
  });

  it('returns plain permission strings when short', async () => {
    const result = await permissions({ appId: TRANSLATE, short: true });

    expect(result.length).toBeGreaterThan(3);
    for (const name of result) {
      expect(typeof name).toBe('string');
    }
  });
});
