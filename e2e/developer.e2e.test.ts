import { expect, it } from 'vitest';
import { clientFromOptions } from '../src/core/http.js';
import { fetchDeveloperFirstPage } from '../src/features/developer/developer.js';
import { type DeveloperApp } from '../src/index.js';
import { liveClient, liveDescribe } from './helpers.js';

const GOOGLE_DEV_ID = '5700313618786177705';

liveDescribe('developer live contract', () => {
  it('returns Google apps for the numeric developer id', async () => {
    const items = (await liveClient.developer({
      devId: GOOGLE_DEV_ID,
      num: 40,
    })) as DeveloperApp[];

    expect(items.length).toBeGreaterThanOrEqual(30);
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);
    for (const item of items) {
      expect(item.developer).toContain('Google');
      expect(item.url.startsWith('https://play.google.com')).toBe(true);
    }
  });

  it('crosses the cluster boundary for the google numeric id', async () => {
    const items = (await liveClient.developer({
      devId: GOOGLE_DEV_ID,
      num: 100,
    })) as DeveloperApp[];

    expect(items.length).toBeGreaterThanOrEqual(80);
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);
    for (const item of items) {
      expect(item.developer).toContain('Google');
      expect(item.url.startsWith('https://play.google.com')).toBe(true);
    }
  });

  it('slices to exactly num when more apps are available', async () => {
    const items = (await liveClient.developer({
      devId: GOOGLE_DEV_ID,
      num: 60,
    })) as DeveloperApp[];

    expect(items).toHaveLength(60);
  });

  it('confirms the numeric first page still requires a continuation', async () => {
    const { apps, token } = await fetchDeveloperFirstPage(
      { devId: GOOGLE_DEV_ID, lang: 'en', country: 'us', throttle: 1 },
      clientFromOptions,
    );

    expect(apps.length).toBeGreaterThan(0);
    expect(apps.length).toBeLessThan(40);
    expect(token).toBeDefined();
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
