import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseScriptData, resolveDsKey } from './scriptData.js';

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

  it('returns empty records when the markers are absent', () => {
    const data = parseScriptData('<html><body>nothing here</body></html>');
    expect(data.blocks).toEqual({});
    expect(data.serviceRequests).toEqual({});
  });
});

describe('resolveDsKey', () => {
  it('returns the ds key whose rpc id matches', () => {
    const data = parseScriptData(detailsLike);
    expect(resolveDsKey(data, 'rpcFive')).toBe('ds:5');
    expect(resolveDsKey(data, 'rpcFour')).toBe('ds:4');
  });

  it('returns undefined when no rpc id matches', () => {
    const data = parseScriptData(detailsLike);
    expect(resolveDsKey(data, 'unknown-rpc')).toBeUndefined();
  });
});
