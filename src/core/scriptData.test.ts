import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { ParseError } from './errors.js';
import { deriveScriptDataSelection, parseScriptData, resolveDsKeys } from './scriptData.js';
import { optional, required } from './spec.js';

const detailsLike = readFileSync(
  fileURLToPath(new URL('../../test/fixtures/synthetic/details-like.html', import.meta.url)),
  'utf8',
);

describe('parseScriptData', () => {
  it('collects valid blocks and skips the block with invalid json', () => {
    const data = parseScriptData(detailsLike);
    expect(Object.keys(data.blocks).sort()).toEqual(['ds:4', 'ds:5']);
    expect(data.blocks['ds:4']).toEqual([['from-ds4']]);
    expect(data.blocks['ds:9']).toBeUndefined();
  });

  it('fills the service request map from the routing table', () => {
    const data = parseScriptData(detailsLike);
    expect(data.serviceRequests).toEqual({ 'ds:4': 'rpcFour', 'ds:5': 'rpcFive' });
  });

  it('skips script blocks missing their key or payload', () => {
    const keyless = `<script>AF_initDataCallback({hash: '1', data:[1], sideChannel: {}});</script>`;
    const payloadless = `<script>AF_initDataCallback({key: 'ds:7', hash: '1'});</script>`;
    const valid = `<script>AF_initDataCallback({key: 'ds:8', hash: '1', data:[8], sideChannel: {}});</script>`;
    const data = parseScriptData(`${keyless}${payloadless}${valid}`);
    expect(Object.keys(data.blocks)).toEqual(['ds:8']);
    expect(data.blocks['ds:8']).toEqual([8]);
  });

  it('returns empty records when the markers are absent', () => {
    const data = parseScriptData('<html><body>nothing here</body></html>');
    expect(data.blocks).toEqual({});
    expect(data.serviceRequests).toEqual({});
  });

  it('unions absolute keys with keys resolved from requested rpc ids', () => {
    const selection = deriveScriptDataSelection([
      {
        rpcId: 'rpcFive',
        paths: [['ds:4']],
        schema: z.unknown(),
        missing: required(),
      },
    ]);
    const data = parseScriptData(detailsLike, selection);

    expect(data.blocks).toEqual({
      'ds:4': [['from-ds4']],
      'ds:5': [
        [['Panda App'], ['com.panda.app']],
        [null, '5,000,000+'],
        { nested: { deep: 'value' } },
      ],
    });
    expect(data.serviceRequests).toEqual({ 'ds:4': 'rpcFour', 'ds:5': 'rpcFive' });
  });

  it('skips malformed unselected blocks', () => {
    const selection = deriveScriptDataSelection([
      { paths: [['ds:4']], schema: z.unknown(), missing: optional() },
    ]);
    const data = parseScriptData(detailsLike, selection);

    expect(data.blocks).toEqual({ 'ds:4': [['from-ds4']] });
  });

  it('rejects malformed selected json without exposing its payload', () => {
    const selection = deriveScriptDataSelection([
      { paths: [['ds:9']], schema: z.unknown(), missing: optional() },
    ]);
    let thrown: unknown;
    try {
      parseScriptData(detailsLike, selection);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ParseError);
    expect((thrown as Error).message).toBe('script data block ds:9: invalid JSON');
    expect((thrown as Error).message).not.toContain('oops');
  });

  it('rejects duplicate selected callback keys', () => {
    const block = `<script>AF_initDataCallback({key: 'ds:4', hash: '1', data:[4], sideChannel: {}});</script>`;
    const selection = deriveScriptDataSelection([
      { paths: [['ds:4']], schema: z.unknown(), missing: optional() },
    ]);

    expect(() => parseScriptData(`${block}${block}`, selection)).toThrow(
      'script data block ds:4: duplicate selected callback',
    );
  });
});

describe('deriveScriptDataSelection', () => {
  it('derives absolute field keys without inspecting transforms', () => {
    const selection = deriveScriptDataSelection([
      {
        paths: [['ds:7', 1]],
        schema: z.string(),
        missing: required(),
        transform: () => {
          throw new Error('must not run');
        },
      },
    ]);

    expect(selection.blockKeys).toEqual(new Set(['ds:7']));
    expect(selection.rpcIds).toEqual(new Set());
  });

  it('rejects a requirement without an absolute key or rpc id', () => {
    expect(() =>
      deriveScriptDataSelection([
        {
          paths: [[]],
          schema: z.unknown(),
          missing: optional(),
        },
      ]),
    ).toThrow('script data requirement has no statically resolvable key');
  });
});

describe('resolveDsKeys', () => {
  it('returns every matching ds key in service table order', () => {
    const data = parseScriptData(detailsLike);
    data.serviceRequests['ds:9'] = 'rpcFive';
    expect(resolveDsKeys(data, 'rpcFive')).toEqual(['ds:5', 'ds:9']);
    expect(resolveDsKeys(data, 'rpcFour')).toEqual(['ds:4']);
  });

  it('returns an empty array when no rpc id matches', () => {
    const data = parseScriptData(detailsLike);
    expect(resolveDsKeys(data, 'unknown-rpc')).toEqual([]);
  });
});
