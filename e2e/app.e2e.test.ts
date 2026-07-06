import { describe, expect, it } from 'vitest';
import { app } from '../src/index.js';

describe('app live contract', () => {
  it('returns details for a popular free app', async () => {
    const appId = 'com.google.android.apps.translate';
    const result = await app({ appId });

    expect(result.title.length).toBeGreaterThan(0);
    expect(result.appId).toBe(appId);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(5);
    expect(result.ratings).toBeGreaterThan(100000);
    expect(result.free).toBe(true);
  });

  it('returns details for a paid app', async () => {
    const result = await app({ appId: 'com.mojang.minecraftpe' });

    expect(result.title.length).toBeGreaterThan(0);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(5);
    expect(result.free).toBe(false);
    expect(result.price).toBeGreaterThan(0);
  });
});
