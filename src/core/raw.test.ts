import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { ParseError } from './errors.ts';
import { parseRaw, rawArrayPathSchema, rawOptionalArrayPathSchema } from './raw.ts';

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

  const clusterTokenSchema = rawOptionalArrayPathSchema([0, 0, 7, 1], z.nullable(z.string()));
  const withTokenNode = (tokenNode: unknown): unknown[] => {
    const inner: unknown[] = [];
    inner[7] = tokenNode;
    return [[inner]];
  };

  it('treats a null segment like an absent one at every depth', () => {
    expect(() => parseRaw(clusterTokenSchema, [null], 'token')).not.toThrow();
    expect(() => parseRaw(clusterTokenSchema, [[null]], 'token')).not.toThrow();
    expect(() => parseRaw(clusterTokenSchema, withTokenNode(null), 'token')).not.toThrow();
    expect(() => parseRaw(clusterTokenSchema, withTokenNode(undefined), 'token')).not.toThrow();
    expect(() => parseRaw(clusterTokenSchema, withTokenNode([null, null]), 'token')).not.toThrow();
    expect(() =>
      parseRaw(clusterTokenSchema, withTokenNode([null, 'next']), 'token'),
    ).not.toThrow();
  });

  it('still rejects a present segment of the wrong type', () => {
    expect(() => parseRaw(clusterTokenSchema, withTokenNode('text'), 'token')).toThrow(
      'token: 0.0.7',
    );
    expect(() => parseRaw(clusterTokenSchema, withTokenNode({}), 'token')).toThrow('token: 0.0.7');
    expect(() => parseRaw(clusterTokenSchema, withTokenNode([null, 5]), 'token')).toThrow(
      'token: 0.0.7.1',
    );
    expect(() => parseRaw(clusterTokenSchema, ['text'], 'token')).toThrow('token: 0');
  });

  it('still requires an array at the root of an optional path', () => {
    expect(() => parseRaw(clusterTokenSchema, null, 'token')).toThrow(ParseError);
  });
});
