import { describe, expect, it } from 'vitest';
import { categories } from './categories.ts';
import { category } from '../../constants.ts';
import { ValidationError } from '../../core/errors.ts';

describe('categories', () => {
  it('returns the full Google Play category taxonomy', async () => {
    const result = await categories();

    expect(result).toEqual(Object.values(category));
    expect(result.length).toBeGreaterThan(30);
  });

  it('includes the top level, game and family subcategories', async () => {
    const result = await categories();

    for (const id of [
      'APPLICATION',
      'GAME',
      'SOCIAL',
      'MAPS_AND_NAVIGATION',
      'GAME_PUZZLE',
      'FAMILY_PRETEND',
    ]) {
      expect(result).toContain(id);
    }
  });

  it('yields unique uppercase underscore identifiers', async () => {
    const result = await categories();

    expect(new Set(result).size).toBe(result.length);
    for (const id of result) {
      expect(id).toMatch(/^[A-Z_]+$/);
    }
  });

  it('rejects invalid options through validation', async () => {
    await expect(categories({ throttle: -1 })).rejects.toBeInstanceOf(ValidationError);
  });
});
