import { expect, it } from 'vitest';
import { type DeveloperApp } from '../src/index.js';
import { liveClient, liveDescribe } from './helpers.js';

liveDescribe('developer live contract', () => {
  it('returns Google apps for the numeric developer id', async () => {
    const items = (await liveClient.developer({
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
    const items = (await liveClient.developer({ devId: 'Mojang' })) as DeveloperApp[];

    expect(items.map((item) => item.appId)).toContain('com.mojang.minecraftpe');
  });

  it('includes the Where Am I game when resolving the Adex77 name id', async () => {
    const items = (await liveClient.developer({ devId: 'Adex77' })) as DeveloperApp[];

    expect(items.length).toBeGreaterThan(0);
    expect(items.map((item) => item.appId)).toContain('com.adex77.WhereAmI');
    for (const item of items) {
      expect(item.developer).toBe('Adex77');
      expect(item.url.startsWith('https://play.google.com')).toBe(true);
    }
  });
});
