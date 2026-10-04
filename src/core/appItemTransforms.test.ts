import { describe, expect, it } from 'vitest';
import {
  developerIdFromUrl,
  isFreeMicros,
  microsToUnits,
  resolveAppUrl,
} from './appItemTransforms.ts';

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

  it.each([
    ['/store/apps/dev?id=5700313618786177705', '5700313618786177705'],
    ['/store/apps/developer?id=Mojang', 'Mojang'],
    ['/store/apps/developer?id=WhatsApp+LLC', 'WhatsApp LLC'],
    ['/store/apps/developer?id=Fourth+Enterprises,+LLC', 'Fourth Enterprises, LLC'],
    ['/store/apps/developer?id=H%26M', 'H&M'],
    ['/store/apps/developer?id=AT%26T+Services,+Inc.', 'AT&T Services, Inc.'],
    ['/store/apps/developer?id=Moon%2B', 'Moon+'],
    ['/store/apps/developer?id=A%2B+Federal+Credit+Union', 'A+ Federal Credit Union'],
    ['/store/apps/developer?id=Danfoss+A/S', 'Danfoss A/S'],
    ['/store/apps/developer?id=The+Pok%C3%A9mon+Company', 'The Pokémon Company'],
    ['/store/apps/developer?id=%E3%82%B3%E3%83%9F%E3%83%81', 'コミチ'],
    ['/store/apps/dev?id=5700313618786177705&hl=en', '5700313618786177705'],
    ['https://play.google.com/store/apps/developer?id=Mojang', 'Mojang'],
    ['/store/apps/developer?id=Mojang#details', 'Mojang'],
    ['/store/apps/developer?pid=1&id=Mojang', 'Mojang'],
    ['/store/apps/developer?id=Mojang&id=Other', 'Mojang'],
    ['/store/apps/developer?id=A%23B', 'A#B'],
  ])('decodes the id parameter of %s', (link, expected) => {
    expect(developerIdFromUrl(link)).toBe(expected);
  });

  it('returns undefined without an id parameter or for non strings', () => {
    expect(developerIdFromUrl('/store/apps/dev')).toBeUndefined();
    expect(developerIdFromUrl(undefined)).toBeUndefined();
    expect(developerIdFromUrl(42)).toBeUndefined();
    expect(developerIdFromUrl('http://')).toBeUndefined();
  });
});
