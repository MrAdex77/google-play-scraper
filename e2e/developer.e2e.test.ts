import { describe, expect, it } from 'vitest';
import { developer, type DeveloperApp } from '../src/index.js';

describe('developer live contract', () => {
  it('returns Google apps for the numeric developer id', async () => {
    const items = (await developer({
      devId: '5700313618786177705',
      num: 40,
    })) as DeveloperApp[];

    expect(items.length).toBeGreaterThanOrEqual(30);
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);
    for (const item of items) {
      expect(item.developer).toContain('Google');
      expect(item.url.startsWith('https://play.google.com')).toBe(true);
    }
  });

  it('includes Minecraft when resolving the Mojang name id', async () => {
    const items = (await developer({ devId: 'Mojang' })) as DeveloperApp[];

    expect(items.map((item) => item.appId)).toContain('com.mojang.minecraftpe');
  });
});
