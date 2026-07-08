import { describe, expect, it } from 'vitest';
import { clusterItemSpecs } from './clusterItem.js';
import { SpecError } from './errors.js';
import { extract } from './spec.js';

const buildClusterItem = (priceCell: unknown[] | undefined): unknown[] => {
  const item: unknown[] = [];
  item[1] = [null, [[null, null, null, [null, null, 'https://icon.example/app.png']]]];
  item[2] = 'Cluster App';
  item[4] = [[['Cluster Dev']], [null, [null, [null, 'A cluster summary']]]];
  item[6] = [[null, null, [null, ['4.2', 4.2]]]];
  if (priceCell !== undefined) {
    item[7] = [[null, null, null, [null, null, [null, [priceCell]]]]];
  }
  item[9] = [null, null, null, null, [null, null, '/store/apps/details?id=com.cluster.app']];
  item[12] = ['com.cluster.app'];
  return item;
};

describe('cluster item extraction', () => {
  it('parses a paid item with a currency and a textual price', () => {
    const result = extract(
      buildClusterItem([null, 'USD', '$3.99']),
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

  it('falls back to zero when the price text carries no digits', () => {
    const result = extract(
      buildClusterItem([null, 'USD', 'Install']),
      clusterItemSpecs,
      'cluster-test',
    );

    expect(result.price).toBe(0);
    expect(result.free).toBe(false);
  });

  it('throws a SpecError naming url when the link cell is missing', () => {
    const item = buildClusterItem([null, 'USD', '$3.99']);
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
});
