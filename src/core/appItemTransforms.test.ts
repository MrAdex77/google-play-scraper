import { describe, expect, it } from 'vitest';
import { isFreeMicros, microsToUnits, resolveAppUrl } from './appItemTransforms.js';

describe('app item transforms', () => {
  it('resolves relative app links and rejects non-string values', () => {
    expect(resolveAppUrl('/store/apps/details?id=com.example')).toBe(
      'https://play.google.com/store/apps/details?id=com.example',
    );
    expect(resolveAppUrl(null)).toBeUndefined();
  });

  it('converts numeric micros and rejects non-numeric values', () => {
    expect(microsToUnits(3_990_000)).toBe(3.99);
    expect(microsToUnits('3990000')).toBe(0);
  });

  it('recognizes only exact zero as free', () => {
    expect(isFreeMicros(0)).toBe(true);
    expect(isFreeMicros(undefined)).toBe(false);
  });
});
