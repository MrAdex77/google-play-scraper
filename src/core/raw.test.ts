import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { ParseError } from './errors.js';
import { parseRaw, rawArrayPathSchema, rawOptionalArrayPathSchema } from './raw.js';

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

describe('rawArrayPathSchema', () => {
  it('validates a leaf at its declared array path', () => {
    const schema = rawArrayPathSchema([0, 2, 1], z.array(z.unknown()));

    expect(() => parseRaw(schema, [[null, null, [null, []]]], 'collection')).not.toThrow();
    expect(() => parseRaw(schema, [[null, null, [null, null]]], 'collection')).toThrow(
      'collection: 0.2.1',
    );
  });

  it('accepts an absent optional path and validates it when present', () => {
    const schema = rawOptionalArrayPathSchema([1, 2], z.nullable(z.string()));

    expect(() => parseRaw(schema, [], 'token')).not.toThrow();
    expect(() => parseRaw(schema, [null, []], 'token')).not.toThrow();
    expect(() => parseRaw(schema, [null, [null, null, 'next']], 'token')).not.toThrow();
    expect(() => parseRaw(schema, [null, [null, null, 5]], 'token')).toThrow('token: 1.2');
  });
});
