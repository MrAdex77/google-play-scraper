import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BATCH_URL, buildBatchBody, parseBatchResponse } from './batchexecute.js';
import { BASE_URL } from '../constants.js';
import { ParseError } from './errors.js';

const chunked = readFileSync(
  fileURLToPath(new URL('../../test/fixtures/synthetic/batch-chunked.txt', import.meta.url)),
  'utf8',
);

const innerEnvelope = (body: string): unknown[] => {
  const req = new URLSearchParams(body).get('f.req');
  const envelope = JSON.parse(req ?? '') as unknown[][][];
  return envelope[0]![0]!;
};

describe('BATCH_URL', () => {
  it('points at the play store batchexecute endpoint', () => {
    expect(BATCH_URL).toBe(`${BASE_URL}/_/PlayStoreUi/data/batchexecute`);
  });
});

describe('buildBatchBody', () => {
  it('round trips the payload through url encoding and json', () => {
    const payload = { term: 'panda', count: 3 };
    const inner = innerEnvelope(buildBatchBody('rpcX', payload));
    expect(inner[0]).toBe('rpcX');
    expect(JSON.parse(inner[1] as string)).toEqual(payload);
  });

  it('uses the generic tail by default', () => {
    const inner = innerEnvelope(buildBatchBody('rpcX', { a: 1 }));
    expect(inner[2]).toBeNull();
    expect(inner[3]).toBe('generic');
  });

  it('supports the permissions tail of null and one', () => {
    const inner = innerEnvelope(buildBatchBody('rpcX', { a: 1 }, [null, '1']));
    expect(inner[2]).toBeNull();
    expect(inner[3]).toBe('1');
  });

  it('supports a bare envelope with an empty tail', () => {
    const inner = innerEnvelope(buildBatchBody('rpcX', { a: 1 }, []));
    expect(inner).toHaveLength(2);
    expect(inner[0]).toBe('rpcX');
  });
});

describe('parseBatchResponse', () => {
  it('decodes the wrb.fr envelope from a chunked response', () => {
    expect(parseBatchResponse(chunked, 'rpcChunk')).toEqual([
      ['suggestion-one'],
      ['suggestion-two'],
    ]);
  });

  it('tolerates a null payload', () => {
    const text = `)]}'\n\n17\n[["wrb.fr","rpcNull",null,null,null,null,"generic"]]`;
    expect(parseBatchResponse(text, 'rpcNull')).toBeNull();
  });

  it('parses the whole body when the envelope spans multiple lines', () => {
    const text = `)]}'\n[["wrb.fr","rpcWhole",\n"[1,2,3]",null,null,null,"generic"]]`;
    expect(parseBatchResponse(text, 'rpcWhole')).toEqual([1, 2, 3]);
  });

  it('skips frames that are not arrays before matching the envelope', () => {
    const text = `)]}'\n[5,["wrb.fr","rpcMixed","[true]",null,null,null,"generic"]]`;
    expect(parseBatchResponse(text, 'rpcMixed')).toEqual([true]);
  });

  it('skips unparsable lines and matches the envelope on a later line', () => {
    const text = `)]}'\n[not json\n[["wrb.fr","rpcLater","[7]",null,null,null,"generic"]]`;
    expect(parseBatchResponse(text, 'rpcLater')).toEqual([7]);
  });

  it('throws a ParseError when no envelope matches the rpc id', () => {
    expect(() => parseBatchResponse(chunked, 'unknown-rpc')).toThrow(ParseError);
  });

  it('throws a ParseError when there is no array to parse', () => {
    expect(() => parseBatchResponse(")]}' not json at all", 'rpcChunk')).toThrow(ParseError);
  });
});
