import { describe, expect, it } from 'vitest';
import { coverageReport, fieldCoverage } from '../e2e/coverage.js';

describe('fieldCoverage', () => {
  it('reports full coverage when every item fills the field', () => {
    const items = [{ score: 4.5 }, { score: 3.2 }, { score: 5 }];

    expect(fieldCoverage(items, 'score')).toEqual({ filled: 3, total: 3, ratio: 1 });
  });

  it('reports partial coverage when some items miss the field', () => {
    const items = [{ summary: 'a game' }, {}, { summary: 'a tool' }, {}];

    expect(fieldCoverage(items, 'summary')).toEqual({ filled: 2, total: 4, ratio: 0.5 });
  });

  it('reports zero coverage when no item fills the field', () => {
    const items = [{ title: 'a' }, { title: 'b' }];

    expect(fieldCoverage(items, 'score')).toEqual({ filled: 0, total: 2, ratio: 0 });
  });

  it('treats empty string and null as unfilled', () => {
    const items = [{ text: '' }, { text: null }, { text: undefined }, { text: 'review' }];

    expect(fieldCoverage(items, 'text')).toEqual({ filled: 1, total: 4, ratio: 0.25 });
  });

  it('treats zero and false as filled values', () => {
    const items = [{ price: 0 }, { free: false }];

    expect(fieldCoverage(items, 'price').filled).toBe(1);
    expect(fieldCoverage(items, 'free').filled).toBe(1);
  });

  it('yields ratio zero for an empty item list', () => {
    expect(fieldCoverage([], 'score')).toEqual({ filled: 0, total: 0, ratio: 0 });
  });
});

describe('coverageReport', () => {
  it('covers each requested field independently', () => {
    const items = [
      { score: 4, summary: 'one', currency: 'USD' },
      { score: undefined, summary: 'two', currency: '' },
      { score: 3, summary: null, currency: 'USD' },
    ];

    expect(coverageReport(items, ['score', 'summary', 'currency'])).toEqual({
      score: { filled: 2, total: 3, ratio: 2 / 3 },
      summary: { filled: 2, total: 3, ratio: 2 / 3 },
      currency: { filled: 2, total: 3, ratio: 2 / 3 },
    });
  });

  it('returns an empty report for no fields', () => {
    expect(coverageReport([{ score: 1 }], [])).toEqual({});
  });
});
