import { describe, expect, it, vi } from 'vitest';
import { htmlToPlainText, plainText } from '../../src/core/htmlText.ts';
import { expectConvertedOnce, expectConvertedSummaries, oraclePlainText } from './plainText.ts';

const ESCAPED_LITERALS = ['Type &lt;b&gt;bold&lt;/b&gt; tags', 'Write &amp;amp; to escape'];
const GOOGLE_MARKUP = 'Hunt &amp; Explore<br><b>now</b>';

function recordingSpy(convert: (value: unknown) => unknown, inputs: readonly unknown[]) {
  const spy = vi.fn(convert);
  const outputs = inputs.map((input) => spy(input));
  return { spy, outputs };
}

function decodeTwice(value: unknown): unknown {
  return typeof value === 'string' ? htmlToPlainText(htmlToPlainText(value)) : value;
}

describe('expectConvertedOnce', () => {
  it('accepts literal markup that one decode pass produces from escaped text', () => {
    const { spy, outputs } = recordingSpy(plainText, ESCAPED_LITERALS);

    expect(outputs).toEqual(['Type <b>bold</b> tags', 'Write &amp; to escape']);
    expect(() => {
      expectConvertedOnce(spy, outputs as string[], 'escaped literals');
    }).not.toThrow();
  });

  it('rejects a value that bypassed the conversion', () => {
    const { spy } = recordingSpy(plainText, [GOOGLE_MARKUP]);

    expect(() => {
      expectConvertedOnce(spy, [GOOGLE_MARKUP], 'passthrough');
    }).toThrow(/must come from plainText/);
  });

  it('rejects a conversion that decodes twice', () => {
    const { spy, outputs } = recordingSpy(decodeTwice, ESCAPED_LITERALS);

    expect(() => {
      expectConvertedOnce(spy, outputs as string[], 'double decode');
    }).toThrow(/one decode of/);
  });

  it('rejects a conversion that keeps google markup', () => {
    const { spy, outputs } = recordingSpy((value) => value, [GOOGLE_MARKUP]);

    expect(() => {
      expectConvertedOnce(spy, outputs as string[], 'identity');
    }).toThrow(/one decode of/);
  });

  it('rejects a surface where every value is missing', () => {
    const { spy } = recordingSpy(plainText, [GOOGLE_MARKUP]);

    expect(() => {
      expectConvertedSummaries(spy, [{}, { summary: undefined }], 'drifted');
    }).toThrow(/at least one value must be present/);
  });

  it('ignores non string conversions', () => {
    const { spy, outputs } = recordingSpy(plainText, [7, GOOGLE_MARKUP]);

    expect(() => {
      expectConvertedOnce(spy, [outputs[1] as string], 'mixed');
    }).not.toThrow();
  });
});

describe('oraclePlainText', () => {
  it('parses in the body context the converter assumes', () => {
    expect(oraclePlainText('x<col>y')).toBe('xy');
    expect(oraclePlainText('a</div>b')).toBe('ab');
  });

  it('reads nested division markup once', () => {
    const html = '<div><p>Real ones</p><br><div>nested</div></div><br>tail';

    expect(oraclePlainText(html)).toBe('Real ones\nnested\ntail');
  });

  it('matches the converter on google markup and escaped literals', () => {
    for (const input of [GOOGLE_MARKUP, ...ESCAPED_LITERALS]) {
      expect(oraclePlainText(input)).toBe(plainText(input));
    }
  });
});
