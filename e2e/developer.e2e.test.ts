import { expect, it } from 'vitest';
import { clientFromOptions } from '../src/core/http.ts';
import {
  fetchDeveloperFirstPage,
  type DeveloperQuery,
} from '../src/features/developer/developer.ts';
import {
  NotFoundError,
  type DegradationEvent,
  type DeveloperApp,
  type IntegrityEvent,
} from '../src/index.ts';
import {
  expectAppItemsContract,
  expectContinuationContract,
  type ContinuationAnchor,
} from './contracts.ts';
import {
  evenlySpaced,
  expectFieldCoverage,
  expectListingOffersAgree,
  liveClient,
  liveDescribe,
  type Storefront,
} from './helpers.ts';

const GOOGLE_DEV_ID = '5700313618786177705';
const GOOGLE_QUERY: DeveloperQuery = {
  devId: GOOGLE_DEV_ID,
  lang: 'en',
  country: 'us',
  throttle: 1,
};
const GOOGLE_NAME = 'Google LLC';
const GOOGLE_NAME_QUERY: DeveloperQuery = {
  devId: GOOGLE_NAME,
  lang: 'en',
  country: 'us',
  throttle: 1,
};
const NETFLIX_NAME = 'Netflix, Inc.';
const MULTI_PAGE_NUM = 100;
const CATALOG_PROBE = 500;
const PAID_CATALOGUE_DEV_ID = '8792077038568095073';
const PAID_CATALOGUE_NUM = 60;
const OFFER_SAMPLE_SIZE = 4;

async function firstPageOf(query: DeveloperQuery): Promise<ContinuationAnchor> {
  const { apps, token } = await fetchDeveloperFirstPage(query, clientFromOptions);

  expect(apps.length, `the ${query.devId} developer page serves no apps at all`).toBeGreaterThan(0);
  return { firstPageCount: apps.length, token };
}

async function continuationOffersAgreeing(storefront: Storefront): Promise<DeveloperApp[]> {
  const label = `${storefront.country} paid catalogue`;
  const events: DegradationEvent[] = [];
  const { firstPageCount } = await firstPageOf({
    devId: PAID_CATALOGUE_DEV_ID,
    ...storefront,
    throttle: 1,
  });

  const items = (await liveClient.developer({
    devId: PAID_CATALOGUE_DEV_ID,
    num: PAID_CATALOGUE_NUM,
    ...storefront,
    onDegradation: (event) => events.push(event),
  })) as DeveloperApp[];

  expect(events, `${label} degraded`).toEqual([]);
  expect(items.length, `${label} lost its continuation pages`).toBeGreaterThan(firstPageCount);
  expectAppItemsContract(items, label);
  const continuation = items.slice(firstPageCount);
  await expectListingOffersAgree(evenlySpaced(continuation, OFFER_SAMPLE_SIZE), storefront, label);
  return continuation;
}

async function googleFirstPage(): Promise<ContinuationAnchor> {
  return firstPageOf(GOOGLE_QUERY);
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
    const integrity: IntegrityEvent[] = [];
    const anchor = await googleFirstPage();

    const items = (await liveClient.developer({
      devId: GOOGLE_DEV_ID,
      num: MULTI_PAGE_NUM,
      onDegradation: (event) => events.push(event),
      onIntegrityEvent: (event) => integrity.push(event),
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
    expect(integrity).toEqual([]);
  });

  it('crosses the cluster boundary for the google name id', async () => {
    const events: DegradationEvent[] = [];
    const integrity: IntegrityEvent[] = [];
    const anchor = await firstPageOf(GOOGLE_NAME_QUERY);

    const items = (await liveClient.developer({
      devId: GOOGLE_NAME,
      num: CATALOG_PROBE,
      onDegradation: (event) => events.push(event),
      onIntegrityEvent: (event) => integrity.push(event),
    })) as DeveloperApp[];

    expectContinuationContract(anchor, items.length, CATALOG_PROBE, 'google name developer');
    expectAppItemsContract(items, 'google name developer continuation');
    for (const item of items) {
      expect(item.developer).toBe(GOOGLE_NAME);
    }
    expect(events, 'a name developer continuation must parse without degrading').toEqual([]);
    expect(integrity, 'a name developer continuation must resolve at its own anchor').toEqual([]);
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
    const events: DegradationEvent[] = [];

    const items = (await liveClient.developer({
      devId: NETFLIX_NAME,
      onDegradation: (event) => events.push(event),
    })) as DeveloperApp[];

    expect(items.map((item) => item.appId)).toContain('com.netflix.mediaclient');
    expectAppItemsContract(items, 'comma developer page');
    for (const item of items) {
      expect(item.developer).toBe(NETFLIX_NAME);
    }
    expect(events).toEqual([]);
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

  it('prices continuation items exactly in a comma decimal storefront', async () => {
    const continuation = await continuationOffersAgreeing({ country: 'de', lang: 'de' });

    expect(new Set(continuation.map((item) => item.currency))).toEqual(new Set(['EUR']));
  });

  it('keeps the continuation pages of an arabic digit storefront', async () => {
    const continuation = await continuationOffersAgreeing({ country: 'sa', lang: 'ar' });

    expect(new Set(continuation.map((item) => item.currency))).toEqual(new Set(['SAR']));
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
