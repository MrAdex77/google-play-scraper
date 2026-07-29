import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { ParseError } from './errors.js';
import { parseRaw } from './raw.js';

describe('parseRaw', () => {
  it('returns validated values', () => {
    const schema = z.object({ values: z.array(z.string()) });

    expect(parseRaw(schema, { values: ['one', 'two'] }, 'raw values')).toEqual({
      values: ['one', 'two'],
    });
  });

  it('converts schema failures to contextual ParseErrors with raw paths', () => {
    const schema = z.object({ nested: z.array(z.string()) });

    expect(() => parseRaw(schema, { nested: [5] }, 'search response')).toThrow(
      new ParseError('search response: nested.0: Invalid input'),
    );
  });

  it('does not replace errors thrown outside zod validation', () => {
    const thrown = new ParseError('upstream parse failure');
    const schema = z.custom(() => {
      throw thrown;
    });

    expect(() => parseRaw(schema, 'value', 'raw value')).toThrow(thrown);
  });
});
