import { expect, it } from 'vitest';
import type { IntegrityEvent } from '../src/index.js';
import { liveClient, liveDescribe } from './helpers.js';

const UNREVIEWED = 'app.hobby_tracker_app';
const UNRATED = 'com.geoguess.app';
const SMALL_CATALOGUE = 'com.adex77.memefast.mememaker';
const REGION_RESTRICTED = 'com.google.android.apps.nbu.paisa.user';
const PLAY_PASS = 'com.noodlecake.altosodyssey';

const EMPTY_HISTOGRAM = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

liveDescribe('edge case listings live contract', () => {
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
    for (const event of events) {
      expect(event.context).toBe('app comments');
    }
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

  it('resolves details for a listing whose comment root moved off both fallbacks', async () => {
    const events: IntegrityEvent[] = [];
    const result = await liveClient.app({
      appId: SMALL_CATALOGUE,
      onIntegrityEvent: (event) => events.push(event),
    });

    expect(result.appId).toBe(SMALL_CATALOGUE);
    expect(result.comments).toEqual([]);
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.minInstalls).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.context).toBe('app comments');
    }
  });

  it('reports the play pass flag for a subscription catalogue title', async () => {
    const result = await liveClient.app({ appId: PLAY_PASS });

    expect(result.isAvailableInPlayPass).toBe(true);
    expect(result.available).toBe(true);
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

  it('returns an empty similar cluster for an app with no recommendations', async () => {
    const results = await liveClient.similar({ appId: UNREVIEWED });

    expect(Array.isArray(results)).toBe(true);
  });
});
