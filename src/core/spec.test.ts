import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { defaulted, extract, optional, required } from './spec.js';
import { parseScriptData, type ScriptData } from './scriptData.js';
import { SpecError } from './errors.js';

const detailsLike = readFileSync(
  fileURLToPath(new URL('../../test/fixtures/synthetic/details-like.html', import.meta.url)),
  'utf8',
);

const loadScriptData = (): ScriptData => parseScriptData(detailsLike);

describe('extract', () => {
  it('resolves a field through an absolute ds path', () => {
    const source = loadScriptData();
    const result = extract(
      source,
      { title: { paths: [['ds:5', 0, 0, 0]], missing: required(), schema: z.string() } },
      'app',
    );
    expect(result.title).toBe('Panda App');
  });

  it('falls back to the next path when the first resolves to null', () => {
    const source = loadScriptData();
    const result = extract(
      source,
      {
        installs: {
          paths: [
            ['ds:5', 1, 0],
            ['ds:5', 1, 1],
          ],
          missing: required(),
          schema: z.string(),
        },
      },
      'app',
    );
    expect(result.installs).toBe('5,000,000+');
  });

  it('resolves relative paths through the service request id', () => {
    const source = loadScriptData();
    const result = extract(
      source,
      {
        title: {
          paths: [[0, 0, 0]],
          missing: required(),
          schema: z.string(),
          serviceRequestId: 'rpcFive',
        },
      },
      'app',
    );
    expect(result.title).toBe('Panda App');
  });

  it('falls through to absolute paths when the service request id is unknown', () => {
    const source = loadScriptData();
    const result = extract(
      source,
      {
        title: {
          paths: [['ds:5', 0, 0, 0]],
          missing: required(),
          schema: z.string(),
          serviceRequestId: 'missing-rpc',
        },
      },
      'app',
    );
    expect(result.title).toBe('Panda App');
  });

  it('passes only the raw value to a transform', () => {
    const source = loadScriptData();
    let seenRaw: unknown;
    const result = extract(
      source,
      {
        appId: {
          paths: [['ds:5', 0, 1, 0]],
          missing: required(),
          schema: z.string(),
          transform: (value) => {
            seenRaw = value;
            return typeof value === 'string' ? value.toUpperCase() : value;
          },
        },
      },
      'app',
    );
    expect(seenRaw).toBe('com.panda.app');
    expect(result.appId).toBe('COM.PANDA.APP');
  });

  it('leaves a missing optional field undefined', () => {
    const source = loadScriptData();
    const result = extract(
      source,
      {
        subtitle: {
          paths: [['ds:5', 9, 9, 9]],
          missing: optional(),
          schema: z.optional(z.string()),
        },
      },
      'app',
    );
    expect(result.subtitle).toBeUndefined();
  });

  it('reports a missing required field without running its transform', () => {
    const source = loadScriptData();
    let transformed = false;
    let thrown: unknown;
    try {
      extract(
        source,
        {
          title: {
            paths: [['ds:5', 9, 9, 9]],
            missing: required(),
            schema: z.string(),
            transform: () => {
              transformed = true;
              return 'manufactured';
            },
          },
        },
        'app',
      );
    } catch (error) {
      thrown = error;
    }
    expect(transformed).toBe(false);
    expect(thrown).toBeInstanceOf(SpecError);
    expect((thrown as SpecError).failures).toEqual([
      {
        field: 'title',
        paths: [['ds:5', 9, 9, 9]],
        message: 'required value missing',
      },
    ]);
  });

  it('creates a fresh default without running the transform', () => {
    const source = loadScriptData();
    let transformed = false;
    const result = extract(
      source,
      {
        tags: {
          paths: [['ds:5', 9, 9, 9]],
          missing: defaulted(() => []),
          schema: z.array(z.string()),
          transform: () => {
            transformed = true;
            return ['manufactured'];
          },
        },
      },
      'app',
    );
    expect(result.tags).toEqual([]);
    expect(transformed).toBe(false);
  });

  it('does not retry after a present candidate fails validation', () => {
    let thrown: unknown;
    try {
      extract(
        { primary: 42, fallback: 'valid' },
        {
          value: {
            paths: [['primary'], ['fallback']],
            missing: required(),
            schema: z.string(),
          },
        },
        'terminal',
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SpecError);
    expect((thrown as SpecError).failures[0]?.paths).toEqual([['primary'], ['fallback']]);
  });

  it('treats a plain value as the root when the source is not script data', () => {
    const payload = [['header'], ['nested', 'value']];
    const result = extract(
      payload,
      { cell: { paths: [[1, 1]], missing: required(), schema: z.string() } },
      'batch',
    );
    expect(result.cell).toBe('value');
  });

  it('aggregates every field failure into a single SpecError', () => {
    const source = loadScriptData();
    let thrown: unknown;
    try {
      extract(
        source,
        {
          rating: { paths: [['ds:5', 0, 0, 0]], missing: required(), schema: z.number() },
          installs: { paths: [['ds:5', 1, 0]], missing: required(), schema: z.string() },
        },
        'app',
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SpecError);
    const specError = thrown as SpecError;
    expect(specError.context).toBe('app');
    expect(specError.failures).toHaveLength(2);
    expect(specError.failures.map((failure) => failure.field).sort()).toEqual([
      'installs',
      'rating',
    ]);
    const ratingFailure = specError.failures.find((failure) => failure.field === 'rating');
    expect(ratingFailure?.paths).toEqual([['ds:5', 0, 0, 0]]);
    expect(specError.message).toContain('rating');
    expect(specError.message).toContain('installs');
  });

  it('prefixes nested zod issue messages with their field path', () => {
    let thrown: unknown;
    try {
      extract(
        [{ name: 42 }],
        {
          entry: {
            paths: [[0]],
            missing: required(),
            schema: z.object({ name: z.string() }),
          },
        },
        'nested',
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SpecError);
    const failure = (thrown as SpecError).failures[0];
    expect(failure?.message).toContain('name:');
  });

  it('captures a thrown Error message from a transform', () => {
    const source = loadScriptData();
    let thrown: unknown;
    try {
      extract(
        source,
        {
          title: {
            paths: [['ds:5', 0, 0, 0]],
            missing: required(),
            schema: z.string(),
            transform: () => {
              throw new Error('transform blew up');
            },
          },
        },
        'app',
      );
    } catch (error) {
      thrown = error;
    }
    expect((thrown as SpecError).message).toContain('transform blew up');
  });

  it('captures a thrown string from a transform', () => {
    const source = loadScriptData();
    let thrown: unknown;
    try {
      extract(
        source,
        {
          title: {
            paths: [['ds:5', 0, 0, 0]],
            missing: required(),
            schema: z.string(),
            transform: () => {
              const failure: unknown = 'plain string failure';
              throw failure;
            },
          },
        },
        'app',
      );
    } catch (error) {
      thrown = error;
    }
    expect((thrown as SpecError).message).toContain('plain string failure');
  });

  it('describes a non-error thrown value from a transform', () => {
    const source = loadScriptData();
    let thrown: unknown;
    try {
      extract(
        source,
        {
          title: {
            paths: [['ds:5', 0, 0, 0]],
            missing: required(),
            schema: z.string(),
            transform: () => {
              const failure: unknown = 42;
              throw failure;
            },
          },
        },
        'app',
      );
    } catch (error) {
      thrown = error;
    }
    expect((thrown as SpecError).message).toContain('non-error thrown during extraction');
  });

  it('reports the resolved service request paths in the failure', () => {
    const source = loadScriptData();
    let thrown: unknown;
    try {
      extract(
        source,
        {
          title: {
            paths: [[0, 0, 0]],
            missing: required(),
            schema: z.number(),
            serviceRequestId: 'rpcFive',
          },
        },
        'app',
      );
    } catch (error) {
      thrown = error;
    }
    const specError = thrown as SpecError;
    expect(specError.failures[0]?.paths).toEqual([['ds:5', 0, 0, 0]]);
  });
});
