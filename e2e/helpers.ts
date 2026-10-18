import { describe, expect } from 'vitest';
import { clientFromOptions, type HttpClient, type ResolveClient } from '../src/core/http.ts';
import { createClient, type AppItem } from '../src/index.ts';
import { expectOfferAgreement } from './contracts.ts';
import { fieldCoverage } from './coverage.ts';

const LIVE_TESTS_DISABLED = process.env.GP_E2E === '0';

const REQUESTS_PER_SECOND = 1;
const PRICED_SAMPLE_SIZE = 4;
const FREE_SAMPLE_SIZE = 2;

export const liveDescribe = describe.skipIf(LIVE_TESTS_DISABLED);

export const liveClient = createClient({ throttle: REQUESTS_PER_SECOND });

export function memoizingResolveClient(): ResolveClient {
  const underlying = clientFromOptions({ throttle: REQUESTS_PER_SECOND });
  const cache = new Map<string, Promise<string>>();
  const client: HttpClient = {
    request(req) {
      const key = `${req.method ?? 'GET'} ${req.url} ${req.body ?? ''}`;
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const pending = underlying.request(req);
      cache.set(key, pending);
      return pending;
    },
  };
  return () => client;
}

export function expectFieldFilledSomewhere(
  context: string,
  items: readonly Record<string, unknown>[],
  fields: readonly string[],
): void {
  for (const field of fields) {
    const { filled, total } = fieldCoverage(items, field);
    const message = `${context}: field "${field}" is empty across all ${total.toString()} anchors`;
    expect(filled, message).toBeGreaterThan(0);
  }
}

export function expectFieldCoverage(
  context: string,
  items: readonly Record<string, unknown>[],
  thresholds: Readonly<Record<string, number>>,
): void {
  for (const [field, minimum] of Object.entries(thresholds)) {
    const { filled, total, ratio } = fieldCoverage(items, field);
    const message = `${context}: field "${field}" coverage ${ratio.toFixed(2)} below ${minimum.toString()} (${filled.toString()}/${total.toString()})`;
    expect.soft(ratio, message).toBeGreaterThanOrEqual(minimum);
  }
}

export interface Storefront {
  country: string;
  lang: string;
}

function pricedFirstSample(items: readonly AppItem[]): AppItem[] {
  const priced = items.filter((item) => item.currency !== undefined);
  const free = items.filter((item) => item.currency === undefined);
  return [...priced.slice(0, PRICED_SAMPLE_SIZE), ...free.slice(0, FREE_SAMPLE_SIZE)];
}

export async function expectListingOffersAgree(
  items: readonly AppItem[],
  storefront: Storefront,
  label: string,
): Promise<void> {
  const sample = pricedFirstSample(items);
  expect(
    sample.some((item) => item.price > 0),
    `${label}: no paid item among ${items.length.toString()} apps, re-anchor the paid sample`,
  ).toBe(true);
  for (const item of sample) {
    const listing = await liveClient.app({ appId: item.appId, ...storefront });
    expectOfferAgreement(item, listing, label);
  }
}
