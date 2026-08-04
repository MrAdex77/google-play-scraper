import { expect, it } from 'vitest';
import type { IntegrityEvent } from '../src/index.js';
import { liveClient, liveDescribe } from './helpers.js';

const UNREVIEWED = 'app.hobby_tracker_app';
const UNRATED = 'com.geoguess.app';
const SMALL_CATALOGUE = 'com.adex77.memefast.mememaker';
const REGION_RESTRICTED = 'com.google.android.apps.nbu.paisa.user';
const PLAY_PASS = 'com.noodlecake.altosodyssey';
const DISCOUNTED = 'com.humble.SlayTheSpire';
const PLAY_PASS_PAID = 'com.chucklefish.stardewvalley';
const NO_SIMILAR = 'org.asccp.app2019';
const NO_COLLECTED_DATA = 'com.hDel.codeblue';
const NON_LATIN = 'jp.naver.line.android';
const ZERO_DECIMAL_PAID = 'com.mojang.minecraftpe';
const RTL_STOREFRONT = 'com.whatsapp';
const IN_APP_PURCHASES = 'com.roblox.client';

const PREREGISTRATION_CANDIDATES = [
  'com.ironhidegames.android.kingdomrush6.genesis',
  'com.devolver.reignsbeyond',
  'com.com2usholdings.agwiv.android.google.global.normal',
  'com.Pocketpair.NeverGrave',
  'com.wanda.jojo.gp.global',
  'com.bytro.warhammer40ksupremacy',
  'com.dreamloft.grumpykingdom',
];

const EMPTY_HISTOGRAM = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
const YEAR_2000_MS = 946684800000;
const YEAR_2100_MS = 4102444800000;

function expectOnlyAppCommentEvents(events: IntegrityEvent[]): void {
  const allowedReasons = new Set(['optional-section-parse', 'rpc-anchor-fallback']);

  for (const event of events) {
    expect(event.context).toBe('app comments');
    expect(allowedReasons.has(event.reason)).toBe(true);
  }
}

liveDescribe('unrated and unreviewed listings live contract', () => {
  it('returns a complete listing for an app with no ratings at all', async () => {
    const events: IntegrityEvent[] = [];
    const result = await liveClient.app({
      appId: UNRATED,
      onIntegrityEvent: (event) => events.push(event),
    });

    expect(result.appId).toBe(UNRATED);
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.description.length).toBeGreaterThan(0);
    expect(result.score).toBeUndefined();
    expect(result.scoreText).toBeUndefined();
    expect(result.ratings).toBeUndefined();
    expect(result.histogram).toEqual(EMPTY_HISTOGRAM);
    expect(result.free).toBe(true);
    expect(result.available).toBe(true);
    expect(result.screenshots.length).toBeGreaterThan(0);
    expectOnlyAppCommentEvents(events);
  });

  it('returns an empty review page for an app that has no reviews', async () => {
    const result = await liveClient.reviews({ appId: UNREVIEWED, num: 20 });

    expect(result.data).toEqual([]);
    expect(result.nextPaginationToken).toBeNull();
  });

  it('stops cleanly when paginating an app that has no reviews', async () => {
    const events: IntegrityEvent[] = [];
    const result = await liveClient.reviews({
      appId: UNREVIEWED,
      paginate: true,
      onIntegrityEvent: (event) => events.push(event),
    });

    expect(result.data).toEqual([]);
    expect(result.nextPaginationToken).toBeNull();
    expect(events).toEqual([]);
  });

  it('returns details and a safety report for a listing with no ratings', async () => {
    const details = await liveClient.app({ appId: UNREVIEWED });
    const report = await liveClient.dataSafety({ appId: UNREVIEWED });

    expect(details.histogram).toEqual(EMPTY_HISTOGRAM);
    expect(details.reviews).toBeUndefined();
    expect(details.minInstalls).toBeGreaterThan(0);
    expect(Array.isArray(report.collectedData)).toBe(true);
    expect(Array.isArray(report.securityPractices)).toBe(true);
  });

  it('returns permissions for an app that declares no common permission section', async () => {
    const result = await liveClient.permissions({ appId: UNREVIEWED });

    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      const item = entry as { permission: string; type: number };
      expect(item.permission.length).toBeGreaterThan(0);
    }
  });

  it('returns unrated results alongside rated ones in a single search page', async () => {
    const results = await liveClient.search({ term: 'hobby tracker', num: 30 });

    expect(results.length).toBeGreaterThan(10);
    expect(results.some((item) => item.score === undefined)).toBe(true);
    for (const item of results) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.url.startsWith('https://')).toBe(true);
      expect(typeof item.price).toBe('number');
      expect(typeof item.free).toBe('boolean');
    }
  });
});

liveDescribe('availability and catalogue edges live contract', () => {
  it('marks a listing restricted to another storefront as unavailable', async () => {
    const events: IntegrityEvent[] = [];
    const result = await liveClient.app({
      appId: REGION_RESTRICTED,
      country: 'us',
      onIntegrityEvent: (event) => events.push(event),
    });

    expect(result.available).toBe(false);
    expect(result.preregister).toBe(false);
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.ratings).toBeGreaterThan(0);
    expect(events).toEqual([]);
  });

  it('marks the same listing available on its own storefront', async () => {
    const result = await liveClient.app({ appId: REGION_RESTRICTED, country: 'in' });

    expect(result.available).toBe(true);
  });

  it('resolves details across live comment root variants', async () => {
    const events: IntegrityEvent[] = [];
    const result = await liveClient.app({
      appId: SMALL_CATALOGUE,
      onIntegrityEvent: (event) => events.push(event),
    });

    expect(result.appId).toBe(SMALL_CATALOGUE);
    for (const comment of result.comments) {
      expect(comment.length).toBeGreaterThan(0);
    }
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.minInstalls).toBeGreaterThan(0);
    expectOnlyAppCommentEvents(events);
  });

  it('returns an empty similar cluster for an app with no recommendations', async () => {
    const events: IntegrityEvent[] = [];
    const results = await liveClient.similar({
      appId: NO_SIMILAR,
      onIntegrityEvent: (event) => events.push(event),
    });

    expect(results).toEqual([]);
    expect(events).toEqual([]);
  });

  it('returns an empty safety report for an app that collects no data', async () => {
    const report = await liveClient.dataSafety({ appId: NO_COLLECTED_DATA });

    expect(report.sharedData).toEqual([]);
    expect(report.collectedData).toEqual([]);
    expect(report.securityPractices).toEqual([]);
  });

  it('returns an empty list for a category and collection with no entries', async () => {
    const results = await liveClient.list({
      category: 'DATING',
      collection: 'TOP_PAID',
      num: 20,
    });

    expect(results).toEqual([]);
  });

  it('returns the few entries of a sparsely populated paid collection', async () => {
    const results = await liveClient.list({
      category: 'COMICS',
      collection: 'TOP_PAID',
      num: 20,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThan(20);
    for (const item of results) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(item.free).toBe(false);
      expect(item.price).toBeGreaterThan(0);
    }
  });
});

liveDescribe('commercial model edges live contract', () => {
  it('keeps discount fields consistent for a paid listing', async () => {
    const result = await liveClient.app({ appId: DISCOUNTED });

    expect(result.free).toBe(false);
    expect(result.price).toBeGreaterThan(0);
    expect(result.currency).toBe('USD');

    if (result.discountEndDate === undefined) {
      expect(result.originalPrice).toBeUndefined();
      return;
    }
    expect(result.discountEndDate).toBeGreaterThan(YEAR_2000_MS);
    expect(result.discountEndDate).toBeLessThan(YEAR_2100_MS);
    expect(result.originalPrice).toBeGreaterThan(result.price);
  });

  it('reports the play pass flag for subscription catalogue titles', async () => {
    const bundled = await liveClient.app({ appId: PLAY_PASS });
    const paid = await liveClient.app({ appId: PLAY_PASS_PAID });

    expect(bundled.isAvailableInPlayPass).toBe(true);
    expect(bundled.available).toBe(true);
    expect(paid.isAvailableInPlayPass).toBe(true);
    expect(paid.free).toBe(false);
    expect(paid.price).toBeGreaterThan(0);
  });

  it('reports an in app purchase range without ad support', async () => {
    const result = await liveClient.app({ appId: IN_APP_PURCHASES });

    expect(result.free).toBe(true);
    expect(result.price).toBe(0);
    expect(result.offersIAP).toBe(true);
    expect(result.IAPRange?.trim().length).toBeGreaterThan(0);
    expect(typeof result.adSupported).toBe('boolean');
  });

  it('parses a paid price in a currency without minor units', async () => {
    const result = await liveClient.app({
      appId: ZERO_DECIMAL_PAID,
      lang: 'ja',
      country: 'jp',
    });

    expect(result.currency).toBe('JPY');
    expect(result.free).toBe(false);
    expect(result.price).toBeGreaterThan(0);
    expect(Number.isInteger(result.price)).toBe(true);
    expect(result.priceText.length).toBeGreaterThan(0);
  });
});

liveDescribe('preregistration listings live contract', () => {
  it('resolves every preregistration candidate without a spec failure', async () => {
    const events: IntegrityEvent[] = [];
    const results = await Promise.all(
      PREREGISTRATION_CANDIDATES.map((appId) =>
        liveClient.app({ appId, onIntegrityEvent: (event) => events.push(event) }),
      ),
    );

    for (const result of results) {
      expect(result.title.length).toBeGreaterThan(0);
      expect(result.description.length).toBeGreaterThan(0);
      expect(result.screenshots.length).toBeGreaterThan(0);
      expect(typeof result.preregister).toBe('boolean');
      expect(typeof result.earlyAccessEnabled).toBe('boolean');
    }
    for (const event of events) {
      expect(event.reason).toBe('optional-section-parse');
      expect(event.context).toBe('app comments');
    }
  });

  it('reports an offerless listing for the candidates still in preregistration', async () => {
    const results = await Promise.all(
      PREREGISTRATION_CANDIDATES.map((appId) => liveClient.app({ appId })),
    );
    const preregistering = results.filter((result) => result.preregister);

    expect(preregistering.length).toBeGreaterThan(0);

    for (const result of preregistering) {
      expect(result.price).toBe(0);
      expect(result.free).toBe(false);
      expect(result.priceText).toBe('Free');
      expect(result.currency).toBeUndefined();
      expect(result.originalPrice).toBeUndefined();
      expect(result.installs).toBeUndefined();
      expect(result.minInstalls).toBeUndefined();
      expect(result.score).toBeUndefined();
      expect(result.ratings).toBeUndefined();
      expect(result.histogram).toEqual(EMPTY_HISTOGRAM);
      expect(result.released).toBeUndefined();
    }
  });

  it('covers early access among the preregistration candidates', async () => {
    const results = await Promise.all(
      PREREGISTRATION_CANDIDATES.map((appId) => liveClient.app({ appId })),
    );
    const earlyAccess = results.filter((result) => result.earlyAccessEnabled);

    expect(earlyAccess.length).toBeGreaterThan(0);

    for (const result of earlyAccess) {
      expect(result.preregister).toBe(true);
      expect(result.title.length).toBeGreaterThan(0);
    }
  });

  it('serves reports and neighbours for a preregistration listing', async () => {
    const appId = PREREGISTRATION_CANDIDATES[0] ?? '';
    const [permissions, safety, similar, reviews] = await Promise.all([
      liveClient.permissions({ appId }),
      liveClient.dataSafety({ appId }),
      liveClient.similar({ appId }),
      liveClient.reviews({ appId, num: 5 }),
    ]);

    expect(permissions.length).toBeGreaterThan(0);
    expect(safety.privacyPolicyUrl?.length).toBeGreaterThan(0);
    expect(similar.length).toBeGreaterThan(0);
    expect(reviews.data).toEqual([]);
    expect(reviews.nextPaginationToken).toBeNull();
  });

  it('keeps a preregistration match in a search page instead of failing it', async () => {
    const results = await liveClient.search({ term: 'Reigns Beyond', num: 20 });

    expect(results.length).toBeGreaterThan(0);
    for (const item of results) {
      expect(typeof item.free).toBe('boolean');
      expect(Number.isFinite(item.price)).toBe(true);
    }
    expect(results.some((item) => item.appId === 'com.devolver.reignsbeyond')).toBe(true);
  });
});

liveDescribe('localized listing edges live contract', () => {
  it('returns a non latin title and a stable genre id', async () => {
    const result = await liveClient.app({ appId: NON_LATIN, lang: 'ja', country: 'jp' });

    expect(result.title.length).toBeGreaterThan(0);
    expect(/[^\x20-\x7e]/.test(result.title)).toBe(true);
    expect(result.genreId).toBe('COMMUNICATION');
    expect(result.free).toBe(true);
  });

  it('returns a right to left listing with a localized install count', async () => {
    const result = await liveClient.app({
      appId: RTL_STOREFRONT,
      lang: 'ar',
      country: 'eg',
    });

    expect(result.title.length).toBeGreaterThan(0);
    expect(/[^\x20-\x7e]/.test(result.title)).toBe(true);
    expect(result.installs?.includes('+')).toBe(true);
    expect(result.minInstalls).toBeGreaterThan(0);
    expect(result.free).toBe(true);
  });
});
