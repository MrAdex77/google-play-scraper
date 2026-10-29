import { describe, expect, it } from 'vitest';
import {
  expectFieldFilledOnEachPageShape,
  expectFieldFilledSomewhere,
} from '../e2e/fieldPresence.ts';

const FIRST_PAGE = [{ score: 4.5, summary: 'rated' }, { summary: 'unrated' }];
const CONTINUATION = [{ summary: 'plain' }, { score: 3.1, summary: 'rated too' }];
const ANCHOR = { firstPageCount: FIRST_PAGE.length, token: 'token' };

describe('expectFieldFilledSomewhere', () => {
  it('passes when every field is filled on at least one item', () => {
    expect(() => {
      expectFieldFilledSomewhere('page', FIRST_PAGE, ['score', 'summary']);
    }).not.toThrow();
  });

  it('names the field that no item fills', () => {
    expect(() => {
      expectFieldFilledSomewhere('page', FIRST_PAGE, ['summary', 'currency']);
    }).toThrow('page: field "currency" is empty across all 2 items');
  });

  it('fails on an empty item list', () => {
    expect(() => {
      expectFieldFilledSomewhere('page', [], ['score']);
    }).toThrow('field "score" is empty across all 0 items');
  });
});

describe('expectFieldFilledOnEachPageShape', () => {
  it('passes when both page shapes fill every field', () => {
    expect(() => {
      expectFieldFilledOnEachPageShape('cluster', [...FIRST_PAGE, ...CONTINUATION], ANCHOR, [
        'score',
        'summary',
      ]);
    }).not.toThrow();
  });

  it('names the continuation when only the first page fills a field', () => {
    const hollowContinuation = CONTINUATION.map(({ summary }) => ({ summary }));

    expect(() => {
      expectFieldFilledOnEachPageShape('cluster', [...FIRST_PAGE, ...hollowContinuation], ANCHOR, [
        'score',
      ]);
    }).toThrow('cluster continuation: field "score" is empty across all 2 items');
  });

  it('names the first page when only the continuation fills a field', () => {
    const hollowFirstPage = FIRST_PAGE.map(({ summary }) => ({ summary }));

    expect(() => {
      expectFieldFilledOnEachPageShape('cluster', [...hollowFirstPage, ...CONTINUATION], ANCHOR, [
        'score',
      ]);
    }).toThrow('cluster first page: field "score" is empty across all 2 items');
  });

  it('refuses an aggregate that never crossed the first page', () => {
    expect(() => {
      expectFieldFilledOnEachPageShape('cluster', FIRST_PAGE, ANCHOR, ['score']);
    }).toThrow('cluster: the aggregate never crossed the 2 items of the first page');
  });
});
