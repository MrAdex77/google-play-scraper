import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseUrl } from './url.ts';

describe('parseUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses an absolute url', () => {
    expect(parseUrl('https://play.google.com/store/apps/details?id=a')?.href).toBe(
      'https://play.google.com/store/apps/details?id=a',
    );
  });

  it('resolves a relative path against the base', () => {
    expect(parseUrl('/store/apps/dev?id=1', 'https://play.google.com')?.href).toBe(
      'https://play.google.com/store/apps/dev?id=1',
    );
  });

  it.each(['', 'not a url', 'http://', '/store/apps'])(
    'returns undefined for %j without a base',
    (input) => {
      expect(parseUrl(input)).toBeUndefined();
    },
  );

  it('returns undefined when the base itself is invalid', () => {
    expect(parseUrl('/store', 'not a base')).toBeUndefined();
  });

  it('does not depend on the static URL.parse or URL.canParse', () => {
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override parse(): never {
          throw new TypeError('URL.parse is not a function');
        }
        static override canParse(): never {
          throw new TypeError('URL.canParse is not a function');
        }
      },
    );

    expect(parseUrl('https://play.google.com/store')?.pathname).toBe('/store');
    expect(parseUrl('http://')).toBeUndefined();
  });
});
