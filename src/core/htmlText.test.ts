import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from './htmlText.js';

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
