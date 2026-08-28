import { expect, it } from 'vitest';
import { permission } from '../src/index.js';
import type { App, IntegrityEvent, ListItem, SearchResult, SimilarApp } from '../src/index.js';
import {
  expectAppItemsContract,
  expectListingContract,
  expectReviewsContract,
} from './contracts.js';
import { liveClient, liveDescribe } from './helpers.js';

const SPARSE_REVIEW_ANCHOR = 'app.hobby_tracker_app';
const SPARSE_RATING_ANCHOR = 'com.geoguess.app';
const COMMENT_ROOT_ANCHOR = 'com.adex77.memefast.mememaker';
const SPARSE_LISTINGS = [SPARSE_REVIEW_ANCHOR, SPARSE_RATING_ANCHOR, COMMENT_ROOT_ANCHOR];
const SPARSE_SAFETY_ANCHOR = 'com.hDel.codeblue';
const SPARSE_SIMILAR_ANCHOR = 'org.asccp.app2019';
const REGION_RESTRICTED = 'com.google.android.apps.nbu.paisa.user';
const REGION_RESTRICTED_HOME = 'in';
const PLAY_PASS_CANDIDATES = [
  'com.noodlecake.altosodyssey',
  'com.chucklefish.stardewvalley',
  'com.ustwo.monumentvalley2',
  'com.playdead.limbo.full',
];
const DISCOUNTED = 'com.humble.SlayTheSpire';
const IAP_CANDIDATES = ['com.roblox.client', 'com.king.candycrushsaga', 'com.mojang.minecraftpe'];
const ZERO_DECIMAL_PAID = 'com.mojang.minecraftpe';
const NON_LATIN = 'jp.naver.line.android';
const RTL_STOREFRONT = 'com.whatsapp';

const SPARSE_PAID_COLLECTIONS = [
  { category: 'DATING', collection: 'TOP_PAID' },
  { category: 'COMICS', collection: 'TOP_PAID' },
] as const;

const PREREGISTRATION_CANDIDATES = [
  'com.ironhidegames.android.kingdomrush6.genesis',
  'com.devolver.reignsbeyond',
  'com.com2usholdings.agwiv.android.google.global.normal',
  'com.Pocketpair.NeverGrave',
  'com.wanda.jojo.gp.global',
  'com.bytro.warhammer40ksupremacy',
  'com.dreamloft.grumpykingdom',
] as const;

const PRIMARY_CANDIDATE = PREREGISTRATION_CANDIDATES[0];

const SPARSE_COLLECTION_NUM = 20;
const YEAR_2000_MS = 946684800000;
const YEAR_2100_MS = 4102444800000;

function expectOnlyAppCommentEvents(events: IntegrityEvent[]): void {
  const allowedReasons = new Set(['optional-section-parse', 'rpc-anchor-fallback']);

  for (const event of events) {
    expect(event.context).toBe('app comments');
    expect(allowedReasons.has(event.reason)).toBe(true);
  }
}

function describeRatingState(listing: App): string {
  return listing.ratings === undefined ? 'unrated' : `${listing.ratings.toString()} ratings`;
}

liveDescribe('sparse listings live contract', () => {
  it('resolves a complete listing for every sparse anchor', async ({ annotate }) => {
    const events: IntegrityEvent[] = [];
    const listings = await Promise.all(
      SPARSE_LISTINGS.map((appId) =>
        liveClient.app({ appId, onIntegrityEvent: (event) => events.push(event) }),
      ),
    );

    for (const listing of listings) {
      expectListingContract(listing, 'sparse listing');
    }
    expectOnlyAppCommentEvents(events);

    await annotate(
      listings.map((listing) => `${listing.appId}: ${describeRatingState(listing)}`).join(', '),
      'notice',
    );
  });

  it('pairs the rating surface with the review surface for a sparse listing', async ({
    annotate,
  }) => {
    const listing = await liveClient.app({ appId: SPARSE_REVIEW_ANCHOR });
    const page = await liveClient.reviews({ appId: SPARSE_REVIEW_ANCHOR, num: 20 });

    if (listing.ratings === undefined) {
      expect(page.data).toEqual([]);
      expect(page.nextPaginationToken).toBeNull();
      await annotate(`${SPARSE_REVIEW_ANCHOR} still carries no ratings`, 'notice');
      return;
    }

    expect(page.data.length).toBeGreaterThan(0);
    for (const review of page.data) {
      expect(review.id.length).toBeGreaterThan(0);
      expect(review.userName.length).toBeGreaterThan(0);
      expect(review.score).toBeGreaterThanOrEqual(1);
      expect(review.score).toBeLessThanOrEqual(5);
      expect(Number.isNaN(Date.parse(review.date))).toBe(false);
    }
    await annotate(`${SPARSE_REVIEW_ANCHOR} now reports ${describeRatingState(listing)}`, 'notice');
  });

  it('stops cleanly when paginating a sparse listing', async () => {
    const events: IntegrityEvent[] = [];
    const result = await liveClient.reviews({
      appId: SPARSE_REVIEW_ANCHOR,
      paginate: true,
      onIntegrityEvent: (event) => events.push(event),
    });

    expect(new Set(result.data.map((review) => review.id)).size).toBe(result.data.length);
    if (result.data.length === 0) {
      expect(result.nextPaginationToken).toBeNull();
    }
    expect(events).toEqual([]);
  });

  it('returns a well formed safety report for a sparse listing', async ({ annotate }) => {
    const report = await liveClient.dataSafety({ appId: SPARSE_SAFETY_ANCHOR });

    expect(Array.isArray(report.sharedData)).toBe(true);
    expect(Array.isArray(report.collectedData)).toBe(true);
    expect(Array.isArray(report.securityPractices)).toBe(true);
    for (const entry of [...report.sharedData, ...report.collectedData]) {
      expect(entry.data.length).toBeGreaterThan(0);
      expect(entry.type.length).toBeGreaterThan(0);
      expect(typeof entry.optional).toBe('boolean');
    }
    expect(report.privacyPolicyUrl?.startsWith('http')).toBe(true);

    await annotate(
      `${SPARSE_SAFETY_ANCHOR} declares ${report.collectedData.length.toString()} collected and ${report.sharedData.length.toString()} shared entries`,
      'notice',
    );
  });

  it('returns typed permission entries for a sparse listing', async () => {
    const result = await liveClient.permissions({ appId: SPARSE_REVIEW_ANCHOR });

    expect(Array.isArray(result)).toBe(true);
    for (const entry of result) {
      const item = entry as { permission: string; type: number };
      expect(item.permission.length).toBeGreaterThan(0);
      expect([permission.COMMON, permission.OTHER]).toContain(item.type);
    }
  });

  it('keeps rating fields consistent across a mixed search page', async ({ annotate }) => {
    const results = (await liveClient.search({ term: 'hobby tracker', num: 30 })) as SearchResult[];

    expect(results.length).toBeGreaterThan(10);
    expectAppItemsContract(results, 'hobby tracker search');

    const unrated = results.filter((item) => item.score === undefined).length;
    await annotate(
      `${unrated.toString()} of ${results.length.toString()} results carry no score`,
      'notice',
    );
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
    expectListingContract(result, 'region restricted listing');
    expect(result.ratings).toBeGreaterThan(0);
    expect(events).toEqual([]);
  });

  it('marks the same listing available on its own storefront', async () => {
    const result = await liveClient.app({
      appId: REGION_RESTRICTED,
      country: REGION_RESTRICTED_HOME,
    });

    expect(result.available).toBe(true);
    expectListingContract(result, 'home storefront listing');
  });

  it('resolves details across live comment root variants', async () => {
    const events: IntegrityEvent[] = [];
    const result = await liveClient.app({
      appId: COMMENT_ROOT_ANCHOR,
      onIntegrityEvent: (event) => events.push(event),
    });

    for (const comment of result.comments) {
      expect(comment.length).toBeGreaterThan(0);
    }
    expectListingContract(result, 'comment root variant listing');
    expectOnlyAppCommentEvents(events);
  });

  it('returns a well formed similar cluster for a low profile listing', async ({ annotate }) => {
    const events: IntegrityEvent[] = [];
    const results = (await liveClient.similar({
      appId: SPARSE_SIMILAR_ANCHOR,
      onIntegrityEvent: (event) => events.push(event),
    })) as SimilarApp[];

    expect(Array.isArray(results)).toBe(true);
    expectAppItemsContract(results, 'low profile similar cluster');
    expect(results.some((item) => item.appId === SPARSE_SIMILAR_ANCHOR)).toBe(false);
    expect(events).toEqual([]);

    await annotate(
      `${SPARSE_SIMILAR_ANCHOR} is recommended alongside ${results.length.toString()} apps`,
      'notice',
    );
  });

  it('returns only paid entries for sparsely populated paid collections', async ({ annotate }) => {
    const counts: string[] = [];

    for (const { category, collection } of SPARSE_PAID_COLLECTIONS) {
      const results = (await liveClient.list({
        category,
        collection,
        num: SPARSE_COLLECTION_NUM,
      })) as ListItem[];

      expect(results.length).toBeLessThanOrEqual(SPARSE_COLLECTION_NUM);
      expectAppItemsContract(results, `${category} ${collection}`);
      for (const item of results) {
        expect(item.free).toBe(false);
        expect(item.price).toBeGreaterThan(0);
      }
      counts.push(`${category}: ${results.length.toString()}`);
    }

    await annotate(counts.join(', '), 'notice');
  });
});

liveDescribe('commercial model edges live contract', () => {
  it('keeps discount fields consistent for a paid listing', async () => {
    const result = await liveClient.app({ appId: DISCOUNTED });

    expectListingContract(result, 'discounted listing');
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

  it('reports the play pass flag across the subscription catalogue anchors', async ({
    annotate,
  }) => {
    const listings = await Promise.all(
      PLAY_PASS_CANDIDATES.map((appId) => liveClient.app({ appId })),
    );

    for (const listing of listings) {
      expectListingContract(listing, 'play pass candidate');
      expect(typeof listing.isAvailableInPlayPass).toBe('boolean');
      if (listing.isAvailableInPlayPass) {
        expect(listing.available).toBe(true);
      }
    }

    const bundled = listings.filter((listing) => listing.isAvailableInPlayPass);
    expect(
      bundled.length,
      'no play pass anchor still reports the subscription flag, re-anchor the pool',
    ).toBeGreaterThan(0);
    await annotate(
      `${bundled.length.toString()} of ${listings.length.toString()} anchors are bundled: ${bundled.map((listing) => listing.appId).join(', ')}`,
      'notice',
    );
  });

  it('reports an in app purchase range alongside the purchase flag', async ({ annotate }) => {
    const listings = await Promise.all(IAP_CANDIDATES.map((appId) => liveClient.app({ appId })));

    for (const listing of listings) {
      expectListingContract(listing, 'in app purchase candidate');
      expect(typeof listing.adSupported).toBe('boolean');
    }

    const offering = listings.filter((listing) => listing.offersIAP === true);
    expect(
      offering.length,
      'no in app purchase anchor advertises a range, re-anchor the pool',
    ).toBeGreaterThan(0);
    for (const listing of offering) {
      expect(listing.IAPRange?.trim().length).toBeGreaterThan(0);
    }
    await annotate(
      offering.map((listing) => `${listing.appId}: ${listing.IAPRange ?? ''}`).join(' | '),
      'notice',
    );
  });

  it('parses a paid price in a currency without minor units', async () => {
    const result = await liveClient.app({
      appId: ZERO_DECIMAL_PAID,
      lang: 'ja',
      country: 'jp',
    });

    expectListingContract(result, 'zero decimal storefront listing');
    expect(result.currency).toBe('JPY');
    expect(result.free).toBe(false);
    expect(result.price).toBeGreaterThan(0);
    expect(Number.isInteger(result.price)).toBe(true);
    expect(result.priceText.length).toBeGreaterThan(0);
  });
});

liveDescribe('preregistration listings live contract', () => {
  it('resolves every preregistration candidate without a spec failure', async ({ annotate }) => {
    const events: IntegrityEvent[] = [];
    const results = await Promise.all(
      PREREGISTRATION_CANDIDATES.map((appId) =>
        liveClient.app({ appId, onIntegrityEvent: (event) => events.push(event) }),
      ),
    );

    for (const result of results) {
      expectListingContract(result, 'preregistration candidate');
      expect(typeof result.preregister).toBe('boolean');
      expect(typeof result.earlyAccessEnabled).toBe('boolean');
    }
    for (const event of events) {
      expect(event.reason).toBe('optional-section-parse');
      expect(event.context).toBe('app comments');
    }

    const preregistering = results.filter((result) => result.preregister);
    const earlyAccess = results.filter((result) => result.earlyAccessEnabled);
    await annotate(
      `${preregistering.length.toString()} of ${results.length.toString()} candidates still preregister, ${earlyAccess.length.toString()} offer early access`,
      'notice',
    );
  });

  it('serves reports and neighbours for a candidate listing', async ({ annotate }) => {
    const appId = PRIMARY_CANDIDATE;
    const [listing, permissions, safety, similar, reviews] = await Promise.all([
      liveClient.app({ appId }),
      liveClient.permissions({ appId }),
      liveClient.dataSafety({ appId }),
      liveClient.similar({ appId }),
      liveClient.reviews({ appId, num: 5 }),
    ]);

    for (const entry of permissions) {
      const item = entry as { permission: string; type: number };
      expect(item.permission.length).toBeGreaterThan(0);
      expect([permission.COMMON, permission.OTHER]).toContain(item.type);
    }
    if (safety.privacyPolicyUrl !== undefined) {
      expect(safety.privacyPolicyUrl.startsWith('http')).toBe(true);
    }
    expectAppItemsContract(similar as SimilarApp[], 'candidate similar cluster');

    if (listing.ratings === undefined) {
      expect(reviews.data).toEqual([]);
      expect(reviews.nextPaginationToken).toBeNull();
    } else {
      expect(reviews.data.length).toBeGreaterThan(0);
      expectReviewsContract(reviews.data, 'candidate reviews');
    }

    await annotate(
      `${appId}: ${permissions.length.toString()} permissions, ${safety.collectedData.length.toString()} collected entries, ${similar.length.toString()} neighbours, ${describeRatingState(listing)}`,
      'notice',
    );
  });

  it('resolves a candidate identically on the listing and search surfaces', async ({
    annotate,
  }) => {
    const appId = PRIMARY_CANDIDATE;
    const listing = await liveClient.app({ appId });
    const results = (await liveClient.search({
      term: listing.title,
      num: 20,
    })) as SearchResult[];

    expectAppItemsContract(results, 'candidate title search');

    const match = results.find((item) => item.appId === appId);
    if (match === undefined) {
      await annotate(`${appId} is not indexed for its own title right now`, 'notice');
      return;
    }
    expect(match.title).toBe(listing.title);
    expect(match.developer).toBe(listing.developer);
    await annotate(`${appId} agrees across the listing and search surfaces`, 'notice');
  });
});

liveDescribe('localized listing edges live contract', () => {
  it('returns a non latin title and a stable genre id', async () => {
    const result = await liveClient.app({ appId: NON_LATIN, lang: 'ja', country: 'jp' });

    expectListingContract(result, 'non latin listing');
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

    expectListingContract(result, 'right to left listing');
    expect(/[^\x20-\x7e]/.test(result.title)).toBe(true);
    expect(result.installs?.includes('+')).toBe(true);
    expect(result.free).toBe(true);
  });
});
