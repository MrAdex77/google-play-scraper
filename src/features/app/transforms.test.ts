import { describe, expect, it } from 'vitest';
import {
  buildHistogram,
  categoriesFromDetail,
  descriptionHtmlLocalized,
  descriptionText,
  developerIdFromUrl,
  extractCategories,
  extractComments,
  extractScreenshots,
  microsToUnits,
  normalizeAndroidVersion,
  priceText,
} from './transforms.js';

const detailWithDescriptions = (translated: unknown, original: unknown): unknown[] => {
  const detail: unknown[] = [];
  detail[12] = [[[null, translated]]];
  detail[72] = [[null, original]];
  return detail;
};

describe('descriptionHtmlLocalized', () => {
  it('prefers the translated description when present', () => {
    expect(descriptionHtmlLocalized(detailWithDescriptions('Hallo', 'Hello'))).toBe('Hallo');
  });

  it('falls back to the original when the translation is empty', () => {
    expect(descriptionHtmlLocalized(detailWithDescriptions('', 'Hello'))).toBe('Hello');
  });

  it('returns undefined when neither description is a string', () => {
    expect(descriptionHtmlLocalized(detailWithDescriptions(null, null))).toBeUndefined();
    expect(descriptionHtmlLocalized(undefined)).toBeUndefined();
  });
});

describe('descriptionText', () => {
  it('strips markup and converts br tags to line breaks', () => {
    expect(descriptionText('line one<br>line <b>two</b>')).toBe('line one\nline two');
  });

  it('returns undefined for a non string value', () => {
    expect(descriptionText(undefined)).toBeUndefined();
    expect(descriptionText(42)).toBeUndefined();
  });
});

describe('priceText', () => {
  it('keeps a nonempty price label', () => {
    expect(priceText('PLN 5.99')).toBe('PLN 5.99');
  });

  it('defaults to Free for empty or missing labels', () => {
    expect(priceText('')).toBe('Free');
    expect(priceText(undefined)).toBe('Free');
  });
});

describe('normalizeAndroidVersion', () => {
  it('extracts the leading numeric token', () => {
    expect(normalizeAndroidVersion('4.4 and up')).toBe('4.4');
  });

  it('returns VARY for non numeric or missing values', () => {
    expect(normalizeAndroidVersion('Varies with device')).toBe('VARY');
    expect(normalizeAndroidVersion(undefined)).toBe('VARY');
  });
});

describe('buildHistogram', () => {
  it('reads each star bucket count from the container', () => {
    const container = [null, [null, 11], [null, 22], [null, 33], [null, 44], [null, 55]];
    expect(buildHistogram(container)).toEqual({ 1: 11, 2: 22, 3: 33, 4: 44, 5: 55 });
  });

  it('fills zeros when the container is missing', () => {
    expect(buildHistogram(undefined)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });
});

describe('microsToUnits', () => {
  it('converts micros to currency units', () => {
    expect(microsToUnits(3_990_000)).toBe(3.99);
  });

  it('returns zero for NaN and non numeric values', () => {
    expect(microsToUnits(Number.NaN)).toBe(0);
    expect(microsToUnits('3990000')).toBe(0);
    expect(microsToUnits(undefined)).toBe(0);
  });
});

describe('developerIdFromUrl', () => {
  it('takes everything after the id parameter', () => {
    expect(developerIdFromUrl('/store/apps/dev?id=5700313618786177705')).toBe(
      '5700313618786177705',
    );
  });

  it('returns undefined without an id parameter or for non strings', () => {
    expect(developerIdFromUrl('/store/apps/dev')).toBeUndefined();
    expect(developerIdFromUrl(undefined)).toBeUndefined();
  });
});

const commentEntry = (text: unknown): unknown[] => {
  const entry: unknown[] = [];
  entry[1] = ['Reviewer'];
  entry[4] = text;
  entry[5] = [1700000000];
  entry[10] = '1.2.3';
  return entry;
};

describe('extractComments', () => {
  it('collects up to five string comments from the primary root', () => {
    const comments = Array.from({ length: 7 }, (_unused, index) =>
      commentEntry(`comment ${index.toString()}`),
    );
    const source = { 'ds:8': [comments] };
    const result = extractComments(source);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe('comment 0');
  });

  it('falls back to the secondary root and skips non string texts', () => {
    const comments = [commentEntry('kept'), commentEntry(null)];
    const source = { 'ds:9': [comments] };
    expect(extractComments(source)).toEqual(['kept']);
  });

  it('returns an empty list when no root carries review markers', () => {
    expect(extractComments({})).toEqual([]);
    expect(extractComments(undefined)).toEqual([]);
  });
});

describe('extractScreenshots', () => {
  it('keeps only entries resolving to string urls', () => {
    const shots = [
      [null, null, null, [null, null, 'https://img.example/1.png']],
      [null, null, null, [null, null, null]],
      [null, null, null, [null, null, 'https://img.example/2.png']],
    ];
    expect(extractScreenshots(shots)).toEqual([
      'https://img.example/1.png',
      'https://img.example/2.png',
    ]);
  });

  it('returns an empty list for a non array value', () => {
    expect(extractScreenshots(undefined)).toEqual([]);
  });
});

describe('extractCategories', () => {
  it('walks nested arrays and captures name and id leaves', () => {
    const tree = [[['Casual', null, 'GAME_CASUAL', null]], [['Puzzle', null, null, null]]];
    expect(extractCategories(tree)).toEqual([
      { name: 'Casual', id: 'GAME_CASUAL' },
      { name: 'Puzzle', id: null },
    ]);
  });

  it('returns the accumulator untouched for empty or non array input', () => {
    expect(extractCategories(undefined)).toEqual([]);
    expect(extractCategories([])).toEqual([]);
  });
});

describe('categoriesFromDetail', () => {
  it('prefers the category tree when it yields entries', () => {
    const detail: unknown[] = [];
    detail[118] = [[['Tools', null, 'TOOLS', null]]];
    expect(categoriesFromDetail(detail)).toEqual([{ name: 'Tools', id: 'TOOLS' }]);
  });

  it('falls back to the genre cell when the tree is empty', () => {
    const detail: unknown[] = [];
    detail[79] = [[['Trivia', null, 'GAME_TRIVIA']]];
    expect(categoriesFromDetail(detail)).toEqual([{ name: 'Trivia', id: 'GAME_TRIVIA' }]);
  });

  it('returns an empty list when neither source resolves', () => {
    expect(categoriesFromDetail([])).toEqual([]);
  });
});
