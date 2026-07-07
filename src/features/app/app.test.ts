import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { app, type AppOptions } from './app.js';
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
