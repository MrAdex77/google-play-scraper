import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { dataSafety, type DataSafetyOptions } from './datasafety.ts';
import { createCountryFetch } from '../../core/countryFetch.ts';
import { MALFORMED_APP_IDS } from '../../../test/helpers/appIds.ts';
import { ParseError, SpecError, ValidationError } from '../../core/errors.ts';
import { expectPlainSafetyReport } from '../../../test/helpers/plainText.ts';
import { DATA_SAFETY_RPC_ID } from './specs.ts';

const TRANSLATE = 'com.google.android.apps.translate';
const FAMILIES_POLICY_HTML =
  'The developer has committed to follow the Play Families Policy &amp; more. <a href="https://support.google.com/googleplay/android-developer/answer/9893335" target="_blank">See the policy</a>';

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/datasafety/${name}`, import.meta.url)),
    'utf8',
  );

const fixture = readFixture('translate.html');

const missingFixture = readFixture('missing.html');

const MISSING_APP_ID = 'com.adex77.definitely.not.a.real.app';

const localizedMissingPages = [
  { lang: 'pt', title: 'Não encontrado', body: readFixture('missing-pt.html') },
  { lang: 'de', title: 'Nicht gefunden', body: readFixture('missing-de.tail.html') },
  { lang: 'ja', title: '見つかりませんでした', body: readFixture('missing-ja.tail.html') },
  { lang: 'ar', title: 'لم يتم العثور على الصفحة', body: readFixture('missing-ar.tail.html') },
  { lang: 'ru', title: 'Не найдено', body: readFixture('missing-ru.tail.html') },
  { lang: 'zh', title: '未找到', body: readFixture('missing-zh.tail.html') },
];

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

  it('returns every recorded report string as plain text beside its markup', async () => {
    const result = await dataSafety({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(fixture) },
    });

    expectPlainSafetyReport(result, 'translate');
    expect(result.securityPractices).toContainEqual({
      practice: 'Independent security review',
      description:
        'This app has been independently validated against a global security standard. See details',
      descriptionHTML:
        'This app has been independently validated against a global security standard. <a href="https://appdefensealliance.dev/masa" target="_blank">See details</a>',
    });
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

  it.each(localizedMissingPages)(
    'returns an empty report for the recorded $lang missing-app page',
    async ({ lang, title, body }) => {
      expect(body).toContain(title);
      expect(body).not.toContain('<title>Not Found</title>');

      const result = await dataSafety({
        appId: MISSING_APP_ID,
        lang,
        requestOptions: { fetchImpl: fetchReturning(body) },
      });

      expect(result).toEqual({
        sharedData: [],
        collectedData: [],
        securityPractices: [],
        privacyPolicyUrl: undefined,
      });
    },
  );

  it('does not treat the english not found title alone as a missing app', async () => {
    const html = `<html><head><title>Not Found</title></head><body></body></html>`;

    await expect(
      dataSafety({
        appId: TRANSLATE,
        requestOptions: { fetchImpl: fetchReturning(html) },
      }),
    ).rejects.toBeInstanceOf(ParseError);
  });

  it('still rejects a localized page whose error markup is gone', async () => {
    const withoutMarker = readFixture('missing-pt.html').replaceAll(
      'id="error-section"',
      'id="renamed-section"',
    );

    await expect(
      dataSafety({
        appId: MISSING_APP_ID,
        lang: 'pt',
        requestOptions: { fetchImpl: fetchReturning(withoutMarker) },
      }),
    ).rejects.toBeInstanceOf(ParseError);
  });

  it('keeps parsing a real page when it contains no error markup', async () => {
    expect(fixture).not.toContain('id="error-section"');

    const result = await dataSafety({
      appId: TRANSLATE,
      lang: 'pt',
      requestOptions: { fetchImpl: fetchReturning(fixture) },
    });

    expect(result.collectedData.length).toBeGreaterThan(0);
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
      {
        practice: 'Data is encrypted',
        description: 'Encrypted in transit',
        descriptionHTML: 'Encrypted in transit',
      },
    ]);
    expect(result.privacyPolicyUrl).toBe('https://example.com/privacy');
  });

  it('turns a security practice description into plain text and keeps its markup', async () => {
    const node138: unknown[] = [];
    node138[9] = [
      null,
      null,
      [[null, 'Committed to follow the Play Families Policy', [null, FAMILIES_POLICY_HTML]]],
    ];
    const html = buildDataSafetyHtml(wrapSafetyNode({ '138': node138 }));

    const result = await dataSafety({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(html) },
    });

    expect(result.securityPractices).toEqual([
      {
        practice: 'Committed to follow the Play Families Policy',
        description:
          'The developer has committed to follow the Play Families Policy & more. See the policy',
        descriptionHTML: FAMILIES_POLICY_HTML,
      },
    ]);
  });

  it('reads a null security practice description as missing', async () => {
    const node138: unknown[] = [];
    node138[9] = [null, null, [[null, 'Data is encrypted in transit', [null, null]]]];
    const html = buildDataSafetyHtml(wrapSafetyNode({ '138': node138 }));

    const result = await dataSafety({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(html) },
    });

    expect(result.securityPractices).toEqual([
      { practice: 'Data is encrypted in transit', description: undefined },
    ]);
  });

  it('rejects a security practice description that is not a string', async () => {
    const node138: unknown[] = [];
    node138[9] = [null, null, [[null, 'Data is encrypted', [null, 7]]]];
    const html = buildDataSafetyHtml(wrapSafetyNode({ '138': node138 }));

    await expect(
      dataSafety({
        appId: TRANSLATE,
        requestOptions: { fetchImpl: fetchReturning(html) },
      }),
    ).rejects.toBeInstanceOf(SpecError);
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

const urlOf = (input: Parameters<typeof fetch>[0]): string => {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
};

describe('datasafety storefront request', () => {
  const recordUrls = (urls: string[]): typeof fetch => {
    return (input) => {
      urls.push(urlOf(input));
      return Promise.resolve(new Response(fixture, { status: 200 }));
    };
  };

  it('sends the default language and country with the app id', async () => {
    const urls: string[] = [];

    await dataSafety({ appId: TRANSLATE, requestOptions: { fetchImpl: recordUrls(urls) } });

    expect(urls).toHaveLength(1);
    const params = new URL(urls[0] ?? '').searchParams;
    expect(Object.fromEntries(params)).toEqual({ id: TRANSLATE, hl: 'en', gl: 'us' });
  });

  it('sends the requested language and country', async () => {
    const urls: string[] = [];

    await dataSafety({
      appId: TRANSLATE,
      lang: 'pt',
      country: 'br',
      requestOptions: { fetchImpl: recordUrls(urls) },
    });

    const params = new URL(urls[0] ?? '').searchParams;
    expect(Object.fromEntries(params)).toEqual({ id: TRANSLATE, hl: 'pt', gl: 'br' });
  });

  it('routes through a per-country fetch by the country it sends', async () => {
    const routed: string[] = [];
    const fetchImpl = createCountryFetch({
      perCountry: {
        de: (input) => {
          routed.push(urlOf(input));
          return Promise.resolve(new Response(fixture, { status: 200 }));
        },
      },
      fallback: () => Promise.reject(new Error('fallback route must not be used')),
    });

    await dataSafety({ appId: TRANSLATE, country: 'de', requestOptions: { fetchImpl } });

    expect(routed).toHaveLength(1);
  });
});

describe('datasafety guards', () => {
  it('rejects a missing appId with a ValidationError', async () => {
    await expect(dataSafety({} as DataSafetyOptions)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects every malformed appId before any request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    for (const appId of MALFORMED_APP_IDS) {
      await expect(dataSafety({ appId, requestOptions: { fetchImpl } })).rejects.toThrow(
        /^dataSafety: appId: must be/,
      );
    }

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
