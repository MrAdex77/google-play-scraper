import { describe, expect, it } from 'vitest';
import { age, category, clusters, collection, permission, sort } from './constants.js';

describe('constants', () => {
  it('freezes every enum object', () => {
    expect(Object.isFrozen(clusters)).toBe(true);
    expect(Object.isFrozen(category)).toBe(true);
    expect(Object.isFrozen(collection)).toBe(true);
    expect(Object.isFrozen(sort)).toBe(true);
    expect(Object.isFrozen(age)).toBe(true);
    expect(Object.isFrozen(permission)).toBe(true);
  });

  it('matches the ported Google Play values', () => {
    expect(clusters).toEqual({ new: 'new', top: 'top' });
    expect(collection).toEqual({
      TOP_FREE: 'TOP_FREE',
      TOP_PAID: 'TOP_PAID',
      GROSSING: 'GROSSING',
    });
    expect(sort).toEqual({ NEWEST: 2, RATING: 3, HELPFULNESS: 1 });
    expect(age).toEqual({
      FIVE_UNDER: 'AGE_RANGE1',
      SIX_EIGHT: 'AGE_RANGE2',
      NINE_UP: 'AGE_RANGE3',
    });
    expect(permission).toEqual({ COMMON: 0, OTHER: 1 });
  });

  it('exposes the full category set including games and family', () => {
    expect(category.APPLICATION).toBe('APPLICATION');
    expect(category.ANDROID_WEAR).toBe('ANDROID_WEAR');
    expect(category.FAMILY).toBe('FAMILY');
    expect(category.GAME).toBe('GAME');
    expect(category.GAME_WORD).toBe('GAME_WORD');
    expect(Object.keys(category)).toHaveLength(54);
    expect(Object.keys(category).filter((key) => key.startsWith('GAME'))).toHaveLength(18);
  });
});
