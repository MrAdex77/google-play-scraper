import { describe, expect, it } from 'vitest';
import { isFreeMicros, microsToUnits, resolveAppUrl } from './appItemTransforms.js';

describe('app item transforms', () => {
  it('resolves relative app links and rejects non-string values', () => {
    expect(resolveAppUrl('/store/apps/details?id=com.example')).toBe(
      'https://play.google.com/store/apps/details?id=com.example',
    );
    expect(resolveAppUrl(null)).toBeUndefined();
  });

  it('converts finite micros and rejects every other present value', () => {
    expect(microsToUnits(3_990_000)).toBe(3.99);
    expect(microsToUnits(0)).toBe(0);
    expect(microsToUnits(Number.NaN)).toBeUndefined();
    expect(microsToUnits(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(microsToUnits(Number.NEGATIVE_INFINITY)).toBeUndefined();
    expect(microsToUnits('3990000')).toBeUndefined();
    expect(microsToUnits(undefined)).toBeUndefined();
  });

  it('recognizes only exact zero as free', () => {
    expect(isFreeMicros(0)).toBe(true);
    expect(isFreeMicros(undefined)).toBe(false);
  });
});
