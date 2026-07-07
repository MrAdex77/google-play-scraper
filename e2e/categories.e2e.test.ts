import { describe, expect, it } from 'vitest';
import { categories } from '../src/index.js';

describe('categories live contract', () => {
  it('returns uppercase category identifiers including APPLICATION', async () => {
    const result = await categories();

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result).toContain('APPLICATION');
    for (const id of result) {
      expect(id).toMatch(/^[A-Z_]+$/);
    }
  });
});
