import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { suggest } from './suggest.js';
import { SUGGEST_RPC_ID } from './specs.js';
import { ValidationError } from '../../core/errors.js';

const pandFixture = readFileSync(
  fileURLToPath(new URL('../../../test/fixtures/suggest/pand.txt', import.meta.url)),
  'utf8',
);

const fetchReturning = (body: string): typeof fetch => {
  const impl: typeof fetch = () => Promise.resolve(new Response(body, { status: 200 }));
  return impl;
};

const recordingFetch = (body: string): { fetchImpl: typeof fetch; bodies: string[] } => {
  const bodies: string[] = [];
  const fetchImpl: typeof fetch = (_input, init) => {
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl, bodies };
};

const nullPayloadResponse = `)]}'\n\n[["wrb.fr","${SUGGEST_RPC_ID}",null,null,null,null,"generic"]]`;

describe('suggest', () => {
  it('decodes the fixture to between one and five nonempty strings', async () => {
    const results = await suggest({
      term: 'pand',
      requestOptions: { fetchImpl: fetchReturning(pandFixture) },
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(5);
    for (const suggestion of results) {
      expect(typeof suggestion).toBe('string');
      expect(suggestion.length).toBeGreaterThan(0);
    }
  });

  it('returns an empty array when the payload is null', async () => {
    const results = await suggest({
      term: 'pand',
      requestOptions: { fetchImpl: fetchReturning(nullPayloadResponse) },
    });

    expect(results).toEqual([]);
  });

  it('returns an empty array when the suggestion entries are not an array', async () => {
    const payload = JSON.stringify([['not-entries']]);
    const frame = JSON.stringify([
      ['wrb.fr', SUGGEST_RPC_ID, payload, null, null, null, 'generic'],
    ]);
    const results = await suggest({
      term: 'pand',
      requestOptions: { fetchImpl: fetchReturning(`)]}'\n\n${frame}`) },
    });

    expect(results).toEqual([]);
  });

  it('posts a body that decodes back to the expected payload', async () => {
    const { fetchImpl, bodies } = recordingFetch(pandFixture);

    await suggest({ term: 'pand', requestOptions: { fetchImpl } });

    expect(bodies).toHaveLength(1);
    const req = new URLSearchParams(bodies[0]).get('f.req');
    const envelope = JSON.parse(req ?? '') as unknown[][][];
    const inner = envelope[0]![0]!;
    expect(inner[0]).toBe(SUGGEST_RPC_ID);
    expect(JSON.parse(inner[1] as string)).toEqual([[null, ['pand'], [10], [2], 4]]);
  });

  it('throws a ValidationError when the term is missing', async () => {
    await expect(suggest({} as { term: string })).rejects.toBeInstanceOf(ValidationError);
  });
});
