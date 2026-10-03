import { describe, expect, it } from 'vitest';
import { clusterOfferItems } from '../../test/helpers/clusterOfferItems.ts';
import { clusterItemSpecs } from './clusterItem.ts';
import { SpecError } from './errors.ts';
import { extract } from './spec.ts';

const buildClusterItem = (priceCell: unknown[] | undefined, ...offerTail: unknown[]): unknown[] => {
  const item: unknown[] = [];
  item[1] = [null, [[null, null, null, [null, null, 'https://icon.example/app.png']]]];
  item[2] = 'Cluster App';
  item[4] = [[['Cluster Dev']], [null, [null, [null, 'A cluster summary']]]];
  item[6] = [[null, null, [null, ['4.2', 4.2]]]];
  if (priceCell !== undefined) {
    item[7] = [[null, null, null, [null, null, [null, [priceCell, ...offerTail]]]]];
  }
  item[9] = [null, null, null, null, [null, null, '/store/apps/details?id=com.cluster.app']];
  item[12] = ['com.cluster.app'];
  return item;
};

describe('cluster item extraction', () => {
  it('parses a paid item from its micros and currency', () => {
    const result = extract(
      buildClusterItem([3_990_000, 'USD', '$3.99']),
      clusterItemSpecs,
      'cluster-test',
    );

    expect(result.title).toBe('Cluster App');
    expect(result.appId).toBe('com.cluster.app');
    expect(result.url).toBe('https://play.google.com/store/apps/details?id=com.cluster.app');
    expect(result.currency).toBe('USD');
    expect(result.price).toBe(3.99);
    expect(result.free).toBe(false);
    expect(result.score).toBe(4.2);
  });

  it('treats a missing price cell as a free item costing zero', () => {
    const result = extract(buildClusterItem(undefined), clusterItemSpecs, 'cluster-test');

    expect(result.price).toBe(0);
    expect(result.free).toBe(true);
    expect(result.currency).toBeUndefined();
  });

  it('ignores the display text and reads the price from micros', () => {
    const result = extract(
      buildClusterItem([2_500_000, 'USD', 'Install']),
      clusterItemSpecs,
      'cluster-test',
    );

    expect(result.price).toBe(2.5);
    expect(result.free).toBe(false);
  });

  it('throws a SpecError naming url when the link cell is missing', () => {
    const item = buildClusterItem([3_990_000, 'USD', '$3.99']);
    item[9] = null;

    let thrown: unknown;
    try {
      extract(item, clusterItemSpecs, 'cluster-test');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SpecError);
    const failedFields = (thrown as SpecError).failures.map((failure) => failure.field);
    expect(failedFields).toContain('url');
  });

  it('reports an item on sale to zero as free with its currency', () => {
    const result = extract(buildClusterItem([0, 'USD', '$0.00']), clusterItemSpecs, 'cluster-test');

    expect(result.price).toBe(0);
    expect(result.free).toBe(true);
    expect(result.currency).toBe('USD');
  });

  it('reports a discounted but still paid item at its sale price', () => {
    const item = buildClusterItem([250_000, 'USD', '$0.25'], [1_490_000, 'USD', '$1.49'], true, [
      83,
      null,
      null,
      '83% off',
    ]);

    const result = extract(item, clusterItemSpecs, 'cluster-test');

    expect(result.price).toBe(0.25);
    expect(result.free).toBe(false);
    expect(result.currency).toBe('USD');
  });

  it('reads null micros as a missing offer like every other surface', () => {
    const result = extract(
      buildClusterItem([null, 'USD', '$3.99']),
      clusterItemSpecs,
      'cluster-test',
    );

    expect(result.price).toBe(0);
    expect(result.free).toBe(true);
    expect(result.currency).toBe('USD');
  });

  it('throws a SpecError naming price when the micros are not a number', () => {
    let thrown: unknown;
    try {
      extract(buildClusterItem(['3.99', 'USD', '$3.99']), clusterItemSpecs, 'cluster-test');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SpecError);
    const failedFields = (thrown as SpecError).failures.map((failure) => failure.field);
    expect(failedFields).toContain('price');
  });
});

interface RecordedOffer {
  price: number;
  free: boolean;
  currency?: string;
}

const RECORDED_OFFERS: readonly (readonly [string, RecordedOffer])[] = [
  ['us:com.zigzagame.evertale', { price: 0, free: true, currency: 'USD' }],
  ['de:com.zigzagame.evertale', { price: 0, free: true, currency: 'EUR' }],
  ['jp:com.zigzagame.evertale', { price: 0, free: true, currency: 'JPY' }],
  ['in:com.zigzagame.evertale', { price: 0, free: true, currency: 'INR' }],
  ['sa:com.zigzagame.evertale', { price: 0, free: true, currency: 'SAR' }],
  ['us:com.mojang.minecraftpe', { price: 6.99, free: false, currency: 'USD' }],
  ['de:com.mojang.minecraftpe', { price: 6.99, free: false, currency: 'EUR' }],
  ['jp:com.mojang.minecraftpe', { price: 1300, free: false, currency: 'JPY' }],
  ['br:com.mojang.minecraftpe', { price: 10.9, free: false, currency: 'BRL' }],
  ['sa:com.mojang.minecraftpe', { price: 29.99, free: false, currency: 'SAR' }],
  ['de:com.chucklefish.stardewvalley', { price: 4.69, free: false, currency: 'EUR' }],
  ['de:com.robtopx.geometryjump', { price: 3.99, free: false, currency: 'EUR' }],
  ['sa:com.chucklefish.stardewvalley', { price: 20.99, free: false, currency: 'SAR' }],
  ['br:com.robtopx.geometryjump', { price: 19.99, free: false, currency: 'BRL' }],
  ['us:com.roblox.client', { price: 0, free: true }],
  ['us:com.tencent.igfit', { price: 0, free: true }],
];

describe('cluster item offers recorded from live continuation pages', () => {
  it.each(RECORDED_OFFERS)('reads the offer of %s from micros', (key, expected) => {
    const result = extract(clusterOfferItems[key], clusterItemSpecs, 'cluster-test');

    expect(result.price).toBe(expected.price);
    expect(result.free).toBe(expected.free);
    expect(result.currency).toBe(expected.currency);
  });

  it('covers every recorded item and keeps the offer contract on each', () => {
    expect(Object.keys(clusterOfferItems).toSorted()).toEqual(
      RECORDED_OFFERS.map(([key]) => key).toSorted(),
    );

    for (const key of Object.keys(clusterOfferItems)) {
      const result = extract(clusterOfferItems[key], clusterItemSpecs, 'cluster-test');
      if (!result.free && result.currency !== undefined) {
        expect(result.price, key).toBeGreaterThan(0);
      }
    }
  });
});
