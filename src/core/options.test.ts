import { describe, expect, it } from 'vitest';
import { baseOptionsSchema, parseOptions } from './options.js';
import { ValidationError } from './errors.js';

describe('parseOptions', () => {
  it('fills defaults for lang and country', () => {
    const parsed = parseOptions(baseOptionsSchema, {}, 'listApps');

    expect(parsed.lang).toBe('en');
    expect(parsed.country).toBe('us');
  });

  it('keeps provided values over defaults', () => {
    const parsed = parseOptions(baseOptionsSchema, { lang: 'pl', country: 'pl' }, 'listApps');

    expect(parsed.lang).toBe('pl');
    expect(parsed.country).toBe('pl');
  });

  it('rejects a one character country with a ValidationError naming the field', () => {
    const act = (): unknown => parseOptions(baseOptionsSchema, { country: 'u' }, 'listApps');

    expect(act).toThrow(ValidationError);
    expect(act).toThrow(/country/);
    expect(act).toThrow(/listApps/);
  });

  it('accepts request options carrying a fetch implementation', () => {
    const parsed = parseOptions(
      baseOptionsSchema,
      { requestOptions: { fetchImpl: fetch, retries: 3 } },
      'listApps',
    );

    expect(parsed.requestOptions?.retries).toBe(3);
    expect(parsed.requestOptions?.fetchImpl).toBe(fetch);
  });

  it('rejects a non function fetch implementation', () => {
    const act = (): unknown =>
      parseOptions(baseOptionsSchema, { requestOptions: { fetchImpl: 42 } }, 'listApps');

    expect(act).toThrow(ValidationError);
  });
});
