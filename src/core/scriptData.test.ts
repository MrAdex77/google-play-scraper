import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseScriptData, resolveDsKeys } from './scriptData.js';

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
