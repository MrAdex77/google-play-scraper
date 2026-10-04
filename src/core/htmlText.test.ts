import { describe, expect, it } from 'vitest';
import { htmlText, htmlToPlainText, plainText } from './htmlText.ts';

describe('htmlToPlainText', () => {
  it('decodes each supported named entity', () => {
    expect(htmlToPlainText('&amp;')).toBe('&');
    expect(htmlToPlainText('&lt;')).toBe('<');
    expect(htmlToPlainText('&gt;')).toBe('>');
    expect(htmlToPlainText('&quot;')).toBe('"');
    expect(htmlToPlainText('&apos;')).toBe("'");
    expect(htmlToPlainText('&nbsp;')).toBe('\u00a0');
  });

  it('leaves unknown named entities literal', () => {
    expect(htmlToPlainText('&unknown;')).toBe('&unknown;');
    expect(htmlToPlainText('&Amp;')).toBe('&Amp;');
  });

  it('decodes decimal, hex, and astral numeric references', () => {
    expect(htmlToPlainText('&#65;')).toBe('A');
    expect(htmlToPlainText('&#x41;')).toBe('A');
    expect(htmlToPlainText('&#X41;')).toBe('A');
    expect(htmlToPlainText('&#x1F600;')).toBe('\u{1f600}');
  });

  it('replaces out-of-range, surrogate, and zero numeric references like an html parser', () => {
    expect(htmlToPlainText('&#1114112;')).toBe('\ufffd');
    expect(htmlToPlainText('&#55296;')).toBe('\ufffd');
    expect(htmlToPlainText('&#0;')).toBe('\ufffd');
  });

  it('decodes entities exactly once', () => {
    expect(htmlToPlainText('&amp;lt;')).toBe('&lt;');
  });

  it('turns exact lowercase br into a newline and strips other br variants', () => {
    expect(htmlToPlainText('a<br>b')).toBe('a\nb');
    expect(htmlToPlainText('a<br><br>b')).toBe('a\n\nb');
    expect(htmlToPlainText('a<br/>b')).toBe('ab');
    expect(htmlToPlainText('a<br />b')).toBe('ab');
    expect(htmlToPlainText('a<BR>b')).toBe('ab');
  });

  it('normalizes carriage returns the way an html parser preprocesses input', () => {
    expect(htmlToPlainText('a\r\nb')).toBe('a\nb');
    expect(htmlToPlainText('a\rb')).toBe('a\nb');
  });

  it('strips inline tags and keeps their text, including nested tags', () => {
    expect(htmlToPlainText('<b>bold</b> plain')).toBe('bold plain');
    expect(htmlToPlainText('<b><i>deep</i></b>')).toBe('deep');
  });

  it('keeps escaped markup as literal text', () => {
    expect(htmlToPlainText('&lt;b&gt;hi&lt;/b&gt;')).toBe('<b>hi</b>');
  });

  it('passes through a bare ampersand, an empty string, and plain text', () => {
    expect(htmlToPlainText('a & b')).toBe('a & b');
    expect(htmlToPlainText('')).toBe('');
    expect(htmlToPlainText('no markup here')).toBe('no markup here');
  });

  it('strips tags before decoding entities', () => {
    expect(htmlToPlainText('<b>&amp;</b>')).toBe('&');
  });

  it('leaves no complete tag behind when stripping exposes nested angle brackets', () => {
    expect(htmlToPlainText('<scr<b>ipt>alert(1)</b>')).toBe('ipt>alert(1)');
    expect(htmlToPlainText('<scr<b>ipt>payload</scr<b>ipt>')).not.toContain('<script');
    expect(htmlToPlainText('<<b>script>')).not.toContain('<script');
  });
});

describe('htmlToPlainText windows-1252 references', () => {
  it('maps numeric references 128 to 159 the way browsers do', () => {
    expect(htmlToPlainText('wait&#133; it&#146;s &#x96; ok&#153;')).toBe(
      'wait\u2026 it\u2019s \u2013 ok\u2122',
    );
    expect(htmlToPlainText('&#128;&#x9F;')).toBe('\u20ac\u0178');
  });

  it('keeps the unassigned references as the control characters plain text removes', () => {
    expect(plainText('a&#129;b&#x8D;c&#143;d&#144;e&#157;f')).toBe('abcdef');
  });
});

describe('plainText', () => {
  it('strips markup, decodes entities, and turns br into line breaks', () => {
    expect(plainText('line one<br>line <b>two</b> &amp; &#39;three&#39;')).toBe(
      "line one\nline two & 'three'",
    );
  });

  it('removes control characters after decoding', () => {
    expect(plainText('good\u0000 text&#7;')).toBe('good text');
  });

  it('passes a non string value through so the field schema can reject it', () => {
    expect(plainText(undefined)).toBeUndefined();
    expect(plainText(42)).toBe(42);
    expect(plainText(null)).toBeNull();
  });
});

describe('htmlText', () => {
  it('keeps markup and entities as google serves them', () => {
    const html = 'Hunt &amp; <b>Explore</b><br>It&#39;s <a href="https://example.com">here</a>';

    expect(htmlText(html)).toBe(html);
  });

  it('removes control characters like the plain text twin', () => {
    expect(htmlText('a\u0000b<br>\u0007c\u0085')).toBe('ab<br>c');
  });

  it('passes a non string value through to the schema', () => {
    expect(htmlText(42)).toBe(42);
    expect(htmlText(undefined)).toBeUndefined();
  });

  it('gives plain text that is exactly its markup twin decoded once', () => {
    const awkward = [
      'Tom &\u0001amp; Jerry',
      '&#\u000060;b&#\u000062;',
      'a\ud83d<b></b>\ude00z',
      'x\u0085&#133;<br>y',
    ];

    for (const raw of awkward) {
      expect(plainText(raw)).toBe(plainText(htmlText(raw)));
    }
    expect(plainText('Tom &\u0001amp; Jerry')).toBe('Tom & Jerry');
  });
});
