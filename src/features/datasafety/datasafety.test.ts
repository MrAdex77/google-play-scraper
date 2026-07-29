import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dataSafety, type DataSafetyOptions } from './datasafety.js';
import { ParseError, ValidationError } from '../../core/errors.js';
import { DATA_SAFETY_RPC_ID } from './specs.js';

const TRANSLATE = 'com.google.android.apps.translate';

const fixture = readFileSync(
  fileURLToPath(new URL('../../../test/fixtures/datasafety/translate.html', import.meta.url)),
  'utf8',
);

const missingFixture = readFileSync(
  fileURLToPath(new URL('../../../test/fixtures/datasafety/missing.html', import.meta.url)),
  'utf8',
);

const fetchReturning =
  (body: string): typeof fetch =>
  () =>
    Promise.resolve(new Response(body, { status: 200 }));

describe('datasafety fixture parsing', () => {
  it('extracts collected data entries with data, optional, and purpose fields', async () => {
    const result = await dataSafety({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(fixture) },
    });

    expect(result.collectedData.length).toBeGreaterThan(0);
    for (const entry of result.collectedData) {
      expect(typeof entry.data).toBe('string');
      expect(entry.data.length).toBeGreaterThan(0);
      expect(typeof entry.optional).toBe('boolean');
      expect(typeof entry.purpose).toBe('string');
      expect(typeof entry.type).toBe('string');
    }
  });

  it('extracts security practices with nonempty practice strings', async () => {
    const result = await dataSafety({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(fixture) },
    });

    expect(result.securityPractices.length).toBeGreaterThan(0);
    for (const practice of result.securityPractices) {
      expect(typeof practice.practice).toBe('string');
      expect(practice.practice.length).toBeGreaterThan(0);
    }
  });

  it('exposes a privacy policy url that parses', async () => {
    const result = await dataSafety({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(fixture) },
    });

    expect(result.privacyPolicyUrl).toBeDefined();
    expect(() => new URL(result.privacyPolicyUrl ?? '')).not.toThrow();
  });
});

const buildScriptData = (key: string, data: unknown): string =>
  `<script>AF_initDataCallback({key: '${key}', hash: '1', data:${JSON.stringify(data)}, sideChannel: {}});</script>`;

const buildDataSafetyHtml = (data: unknown): string => buildScriptData('ds:3', data);

const buildServiceTable = (entries: Record<string, string>): string => {
  const pairs = Object.entries(entries)
    .map(([key, rpcId]) => `'${key}' : {id:'${rpcId}'}`)
    .join(',');
  return `<script>; var AF_dataServiceRequests = {${pairs}}; var AF_initDataChunkQueue = [];</script>`;
};

const wrapSafetyNode = (node: Record<string, unknown>): unknown[] => {
  const inner: unknown[] = [];
  inner[1] = node;
  const middle: unknown[] = [];
  middle[2] = inner;
  const root: unknown[] = [];
  root[1] = middle;
  return root;
};

describe('datasafety degraded pages', () => {
  it('returns an empty report for the recorded missing-app page', async () => {
    const result = await dataSafety({
      appId: 'com.adex77.definitely.not.a.real.app',
      requestOptions: { fetchImpl: fetchReturning(missingFixture) },
    });

    expect(result.sharedData).toEqual([]);
    expect(result.collectedData).toEqual([]);
    expect(result.securityPractices).toEqual([]);
    expect(result.privacyPolicyUrl).toBeUndefined();
  });

  it('returns empty defaults when the safety blocks are missing', async () => {
    const result = await dataSafety({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(buildDataSafetyHtml([])) },
    });

    expect(result.sharedData).toEqual([]);
    expect(result.collectedData).toEqual([]);
    expect(result.securityPractices).toEqual([]);
    expect(result.privacyPolicyUrl).toBeUndefined();
  });

  it('returns empty defaults when report sections are explicitly null', async () => {
    const node138: unknown[] = [];
    node138[4] = [[null], [null]];
    node138[9] = [null, null, null];

    const result = await dataSafety({
      appId: TRANSLATE,
      requestOptions: {
        fetchImpl: fetchReturning(buildDataSafetyHtml(wrapSafetyNode({ '138': node138 }))),
      },
    });

    expect(result.sharedData).toEqual([]);
    expect(result.collectedData).toEqual([]);
    expect(result.securityPractices).toEqual([]);
  });

  it('skips entries without details and coerces the optional flag', async () => {
    const entryWithoutDetails = [[null, 'Data shared']];
    const collectedEntry = [
      [null, 'Data collected'],
      null,
      null,
      null,
      [['Location', 1, 'App functionality']],
    ];
    const node138: unknown[] = [];
    node138[4] = [[[entryWithoutDetails]], [[collectedEntry]]];
    node138[9] = [null, null, [[null, 'Data is encrypted', [null, 'Encrypted in transit']]]];
    const node100: unknown[] = [
      [null, null, null, null, null, [null, null, 'https://example.com/privacy']],
    ];
    const html = buildDataSafetyHtml(wrapSafetyNode({ '138': node138, '100': node100 }));

    const result = await dataSafety({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(html) },
    });

    expect(result.sharedData).toEqual([]);
    expect(result.collectedData).toEqual([
      { data: 'Location', optional: true, purpose: 'App functionality', type: 'Data collected' },
    ]);
    expect(result.securityPractices).toEqual([
      { practice: 'Data is encrypted', description: 'Encrypted in transit' },
    ]);
    expect(result.privacyPolicyUrl).toBe('https://example.com/privacy');
  });

  it('parses a report moved behind the Ws7gDc route', async () => {
    const node138: unknown[] = [];
    node138[4] = [[], []];
    const routed = wrapSafetyNode({ '138': node138 });
    const html = `${buildScriptData('ds:3', ['malformed fallback'])}${buildScriptData(
      'ds:11',
      routed,
    )}${buildServiceTable({ 'ds:11': DATA_SAFETY_RPC_ID })}`;

    const result = await dataSafety({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(html) },
    });

    expect(result.sharedData).toEqual([]);
    expect(result.collectedData).toEqual([]);
    expect(result.securityPractices).toEqual([]);
  });

  it('rejects present non-array report sections', async () => {
    const node138: unknown[] = [];
    node138[4] = [['invalid-shared'], ['invalid-collected']];
    node138[9] = [null, null, 'invalid-practices'];
    const html = buildDataSafetyHtml(wrapSafetyNode({ '138': node138 }));

    await expect(
      dataSafety({
        appId: TRANSLATE,
        requestOptions: { fetchImpl: fetchReturning(html) },
      }),
    ).rejects.toBeInstanceOf(ParseError);
  });

  it('rejects a page with no declared report root', async () => {
    await expect(
      dataSafety({
        appId: TRANSLATE,
        requestOptions: { fetchImpl: fetchReturning('<html></html>') },
      }),
    ).rejects.toBeInstanceOf(ParseError);
  });

  it('rejects non-report ds:3 root variants', async () => {
    const invalidRoots = [[null], wrapSafetyNode({}), wrapSafetyNode({ other: [] })];

    for (const root of invalidRoots) {
      await expect(
        dataSafety({
          appId: TRANSLATE,
          requestOptions: { fetchImpl: fetchReturning(buildDataSafetyHtml(root)) },
        }),
      ).rejects.toBeInstanceOf(ParseError);
    }
  });
});

describe('datasafety guards', () => {
  it('rejects a missing appId with a ValidationError', async () => {
    await expect(dataSafety({} as DataSafetyOptions)).rejects.toBeInstanceOf(ValidationError);
  });
});
