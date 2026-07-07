import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { categories } from './categories.js';

const storeHome = readFileSync(
  fileURLToPath(new URL('../../../test/fixtures/categories/store-home.html', import.meta.url)),
  'utf8',
);

const fetchReturning = (body: string): typeof fetch => {
  const impl: typeof fetch = () => Promise.resolve(new Response(body, { status: 200 }));
  return impl;
};

const withFixture = (body: string) =>
  categories({ requestOptions: { fetchImpl: fetchReturning(body) } });

describe('categories fixture parsing', () => {
  it('collects the category anchors and appends APPLICATION', async () => {
    const result = await withFixture(storeHome);

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result).toContain('APPLICATION');
    expect(result).toContain('FAMILY');
    expect(result[result.length - 1]).toBe('APPLICATION');
  });

  it('yields only uppercase underscore identifiers', async () => {
    const result = await withFixture(storeHome);

    for (const id of result) {
      expect(id).toMatch(/^[A-Z_]+$/);
    }
  });

  it('does not deduplicate repeated category anchors', async () => {
    const result = await withFixture(storeHome);

    expect(new Set(result).size).toBeLessThan(result.length);
  });

  it('appends APPLICATION even when no category anchors are present', async () => {
    const result = await withFixture('<html><body><a href="/store/search?q=x">x</a></body></html>');

    expect(result).toEqual(['APPLICATION']);
  });
});
