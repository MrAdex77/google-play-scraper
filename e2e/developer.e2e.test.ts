import { expect, it } from 'vitest';
import { clientFromOptions } from '../src/core/http.ts';
import {
  fetchDeveloperFirstPage,
  type DeveloperQuery,
} from '../src/features/developer/developer.ts';
import { NotFoundError, type DegradationEvent, type DeveloperApp } from '../src/index.ts';
import {
  expectAppItemsContract,
  expectContinuationContract,
  type ContinuationAnchor,
} from './contracts.ts';
import { expectFieldCoverage, liveClient, liveDescribe } from './helpers.ts';

const GOOGLE_DEV_ID = '5700313618786177705';
const GOOGLE_QUERY: DeveloperQuery = {
  devId: GOOGLE_DEV_ID,
  lang: 'en',
  country: 'us',
  throttle: 1,
};
const MULTI_PAGE_NUM = 100;
const CATALOG_PROBE = 500;

async function googleFirstPage(): Promise<ContinuationAnchor> {
  const { apps, token } = await fetchDeveloperFirstPage(GOOGLE_QUERY, clientFromOptions);

  expect(apps.length, 'the google developer page serves no apps at all').toBeGreaterThan(0);
  return { firstPageCount: apps.length, token };
}

liveDescribe('developer live contract', () => {
  it('returns the whole first page when num matches it', async () => {
    const { firstPageCount } = await googleFirstPage();

    const items = (await liveClient.developer({
      devId: GOOGLE_DEV_ID,
      num: firstPageCount,
    })) as DeveloperApp[];

    expect(items).toHaveLength(firstPageCount);
    expectAppItemsContract(items, 'google developer page');
    for (const item of items) {
      expect(item.developer).toContain('Google');
    }
  });

  it('slices to exactly num one item past the cluster boundary', async () => {
    const anchor = await googleFirstPage();
    const num = anchor.firstPageCount + 1;

    const items = (await liveClient.developer({
      devId: GOOGLE_DEV_ID,
      num,
    })) as DeveloperApp[];

    expectContinuationContract(anchor, items.length, num, 'google developer boundary slice');
    expectAppItemsContract(items, 'google developer boundary slice');
  });

  it('crosses the cluster boundary for the google numeric id', async () => {
    const events: DegradationEvent[] = [];
    const anchor = await googleFirstPage();

    const items = (await liveClient.developer({
      devId: GOOGLE_DEV_ID,
      num: MULTI_PAGE_NUM,
      onDegradation: (event) => events.push(event),
    })) as DeveloperApp[];

    expectContinuationContract(anchor, items.length, MULTI_PAGE_NUM, 'google developer');
    expectAppItemsContract(items, 'google developer continuation');
    for (const item of items) {
      expect(item.developer).toContain('Google');
    }

    expectFieldCoverage('developer', items, {
      score: 0.8,
      scoreText: 0.8,
      summary: 0.8,
    });
    expect(events).toEqual([]);
  });

  it('confirms the numeric first page still requires a continuation', async () => {
    const { token } = await googleFirstPage();

    expect(
      token,
      'google now serves the whole developer catalogue on one page, re-port the pagination contract',
    ).toBeDefined();
  });

  it('includes Minecraft when resolving the Mojang name id', async () => {
    const items = (await liveClient.developer({ devId: 'Mojang' })) as DeveloperApp[];

    expect(items.map((item) => item.appId)).toContain('com.mojang.minecraftpe');
  });

  it('includes the Where Am I game when resolving the Adex77 name id', async () => {
    const items = (await liveClient.developer({ devId: 'Adex77' })) as DeveloperApp[];

    expect(items.map((item) => item.appId)).toContain('com.adex77.WhereAmI');
    expectAppItemsContract(items, 'adex77 developer page');
    for (const item of items) {
      expect(item.developer).toBe('Adex77');
    }
  });

  it('resolves a developer name containing a comma and space', async () => {
    const items = (await liveClient.developer({ devId: 'Netflix, Inc.' })) as DeveloperApp[];

    expect(items.map((item) => item.appId)).toContain('com.netflix.mediaclient');
    expectAppItemsContract(items, 'comma developer page');
    for (const item of items) {
      expect(item.developer).toBe('Netflix, Inc.');
    }
  });

  it('rejects an unknown numeric developer id with a NotFoundError', async () => {
    await expect(liveClient.developer({ devId: '9999999999999999999' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects an unknown developer name with a NotFoundError', async () => {
    await expect(
      liveClient.developer({ devId: 'DefinitelyNotARealDeveloper8317' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the full catalog and stops when num exceeds it', async () => {
    const items = (await liveClient.developer({
      devId: 'Adex77',
      num: CATALOG_PROBE,
    })) as DeveloperApp[];

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.length).toBeLessThan(CATALOG_PROBE);
    expectAppItemsContract(items, 'exhausted developer catalog');
  });
});
