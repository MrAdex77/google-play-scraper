import { describe, expect, it } from 'vitest';
import { sanitizeText } from './text.js';

describe('sanitizeText', () => {
  it('strips null bytes from within text', () => {
    expect(sanitizeText('a\u0000b')).toBe('ab');
  });

  it('keeps tab, newline, and carriage return while dropping other control chars', () => {
    const input = 'line1\r\nline2\tend\u0007\u009F';
    expect(sanitizeText(input)).toBe('line1\r\nline2\tend');
  });

  it('drops a lone high surrogate and a lone low surrogate', () => {
    expect(sanitizeText('x\uD800y')).toBe('xy');
    expect(sanitizeText('x\uDC00y')).toBe('xy');
  });

  it('preserves a valid surrogate pair', () => {
    const emoji = '\uD83D\uDE00';
    expect(sanitizeText('hi ' + emoji)).toBe('hi ' + emoji);
  });

  it('leaves ordinary text untouched', () => {
    expect(sanitizeText('Clean description text.')).toBe('Clean description text.');
  });

  it('returns undefined for non-string input', () => {
    expect(sanitizeText(undefined)).toBeUndefined();
    expect(sanitizeText(null)).toBeUndefined();
    expect(sanitizeText(42)).toBeUndefined();
  });
});
