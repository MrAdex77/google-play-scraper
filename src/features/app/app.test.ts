import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { app, type AppOptions } from './app.js';
import { getPath } from '../../core/path.js';
import { parseScriptData } from '../../core/scriptData.js';
import { NotFoundError, SpecError, ValidationError } from '../../core/errors.js';

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/app/${name}`, import.meta.url)),
    'utf8',
  );

const translateHtml = readFixture('translate.html');
const minecraftHtml = readFixture('minecraft.html');
const whereAmIHtml = readFixture('whereami.html');

const fetchReturning = (body: string, status = 200): typeof fetch => {
  const impl: typeof fetch = () => Promise.resolve(new Response(body, { status }));
  return impl;
};

const buildScriptData = (key: string, value: unknown): string =>
  `<script>AF_initDataCallback({key: '${key}', hash: '1', data:${JSON.stringify(value)}, sideChannel: {}});</script>`;

describe('app', () => {
  it('parses the translate details page into a validated result', async () => {
    const appId = 'com.google.android.apps.translate';
    const result = await app({
      appId,
      requestOptions: { fetchImpl: fetchReturning(translateHtml) },
    });

    expect(result.title).toContain('Translate');
    expect(result.free).toBe(true);
    expect(result.price).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(3.5);
    expect(result.score).toBeLessThanOrEqual(5);

    const histogramKeys = Object.keys(result.histogram).sort();
    expect(histogramKeys).toEqual(['1', '2', '3', '4', '5']);
    const histogramSum = Object.values(result.histogram).reduce((total, value) => total + value, 0);
    expect(histogramSum).toBeGreaterThan(0);

    expect(result.screenshots.length).toBeGreaterThan(3);
    expect(result.developer).toBe('Google LLC');
    expect(result.installs?.endsWith('+')).toBe(true);
    expect(result.appId).toBe(appId);
    expect(result.url).toContain(`id=${appId}`);
  });

  it('parses paid app fields from the minecraft details page', async () => {
    const result = await app({
      appId: 'com.mojang.minecraftpe',
      requestOptions: { fetchImpl: fetchReturning(minecraftHtml) },
    });

    expect(result.free).toBe(false);
    expect(result.price).toBeGreaterThan(0);
    expect(result.currency).toMatch(/^[A-Z]{3}$/);
    expect(typeof result.offersIAP).toBe('boolean');
  });

  it('parses the Where Am I geography game details page', async () => {
    const appId = 'com.adex77.WhereAmI';
    const result = await app({
      appId,
      requestOptions: { fetchImpl: fetchReturning(whereAmIHtml) },
    });

    expect(result.title).toBe('Where Am I? - GeoGuess Game');
    expect(result.appId).toBe(appId);
    expect(result.developer).toBe('Adex77');
    expect(result.free).toBe(true);
    expect(result.price).toBe(0);
    expect(result.released).toBe('Jan 2, 2021');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(5);
    expect(result.screenshots.length).toBeGreaterThan(0);
  });

  it('sanitizes control characters out of the changelog and description', async () => {
    const appId = 'com.google.android.apps.translate';
    const data = parseScriptData(translateHtml);
    const ds5 = data.blocks['ds:5'] as unknown[];
    const details = (ds5[1] as unknown[])[2] as unknown[];
    const changelogHolder = (details[144] as unknown[])[1] as unknown[];
    changelogHolder[1] = 'Bug\u0000 fixes\u0007 and speedups';
    const dirtyHtml = buildScriptData('ds:5', ds5);

    const result = await app({
      appId,
      requestOptions: { fetchImpl: fetchReturning(dirtyHtml) },
    });

    expect(result.recentChanges).toBe('Bug fixes and speedups');
    expect(result.description.includes(String.fromCharCode(0))).toBe(false);
  });

  it('resolves version, update time, and changelog through the shifted fallback paths', async () => {
    const appId = 'com.google.android.apps.translate';
    const baseline = await app({
      appId,
      requestOptions: { fetchImpl: fetchReturning(translateHtml) },
    });

    const data = parseScriptData(translateHtml);
    const ds5 = data.blocks['ds:5'] as unknown[];
    const details = (ds5[1] as unknown[])[2] as unknown[];
    details.push({ '141': details[140], '145': details[144], '146': details[145] });
    details[140] = null;
    details[144] = null;
    details[145] = null;
    const shiftedHtml = buildScriptData('ds:5', ds5);

    const result = await app({
      appId,
      requestOptions: { fetchImpl: fetchReturning(shiftedHtml) },
    });

    expect(result.version).toBe(baseline.version);
    expect(result.updated).toBe(baseline.updated);
    expect(result.recentChanges).toBe(baseline.recentChanges);
    expect(result.androidVersion).toBe(baseline.androidVersion);
    expect(result.androidVersionText).toBe(baseline.androidVersionText);
  });

  it('reports VARY variants when the version block is absent everywhere', async () => {
    const data = parseScriptData(translateHtml);
    const ds5 = data.blocks['ds:5'] as unknown[];
    const details = (ds5[1] as unknown[])[2] as unknown[];
    details[140] = null;
    details[69] = null;
    const blankedHtml = buildScriptData('ds:5', ds5);

    const result = await app({
      appId: 'com.google.android.apps.translate',
      requestOptions: { fetchImpl: fetchReturning(blankedHtml) },
    });

    expect(result.version).toBe('VARY');
    expect(result.androidVersion).toBe('VARY');
    expect(result.androidVersionText).toBe('Varies with device');
    expect(result.developerEmail).toBeUndefined();
    expect(result.developerLegalAddress).toBeUndefined();
    expect(result.developerLegalPhoneNumber).toBeUndefined();
  });

  it('exposes the original price when a discount is active', async () => {
    const data = parseScriptData(minecraftHtml);
    const ds5 = data.blocks['ds:5'] as unknown[];
    const details = (ds5[1] as unknown[])[2] as unknown[];
    const offer = getPath(details, [57, 0, 0, 0, 0]) as unknown[];
    const pricePair = offer[1] as unknown[];
    pricePair[1] = [10_990_000];
    const discountedHtml = buildScriptData('ds:5', ds5);

    const result = await app({
      appId: 'com.mojang.minecraftpe',
      requestOptions: { fetchImpl: fetchReturning(discountedHtml) },
    });

    expect(result.originalPrice).toBe(10.99);
    expect(result.price).toBeGreaterThan(0);
    expect(result.free).toBe(false);
  });

  it('throws a SpecError naming the field when the title path is blank', async () => {
    const data = parseScriptData(translateHtml);
    const ds5 = data.blocks['ds:5'] as unknown[];
    const details = (ds5[1] as unknown[])[2] as unknown[];
    const titleContainer = details[0] as unknown[];
    titleContainer[0] = null;
    const blankedHtml = buildScriptData('ds:5', ds5);

    let thrown: unknown;
    try {
      await app({
        appId: 'com.google.android.apps.translate',
        requestOptions: { fetchImpl: fetchReturning(blankedHtml) },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SpecError);
    const failedFields = (thrown as SpecError).failures.map((failure) => failure.field);
    expect(failedFields).toContain('title');
  });

  it('surfaces a NotFoundError for a 404 response', async () => {
    await expect(
      app({
        appId: 'com.example.missing',
        requestOptions: { fetchImpl: fetchReturning('not found', 404) },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects options without an appId through validation', async () => {
    await expect(app({} as AppOptions)).rejects.toBeInstanceOf(ValidationError);
  });
});
