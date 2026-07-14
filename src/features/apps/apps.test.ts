import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apps, createApps } from './apps.js';
import type { GetApp } from '../../core/fullDetail.js';
import { GooglePlayError, NotFoundError, ValidationError } from '../../core/errors.js';
import type { App } from '../app/schema.js';

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/app/${name}`, import.meta.url)),
    'utf8',
  );

const translateHtml = readFixture('translate.html');

const urlOf = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const fetchReturning = (body: string, status = 200): typeof fetch => {
  const impl: typeof fetch = () => Promise.resolve(new Response(body, { status }));
  return impl;
};

describe('apps', () => {
  it('resolves ids in order with fully parsed app objects', async () => {
    const appIds = ['com.one', 'com.two', 'com.three'];

    const result = await apps({
      appIds,
      requestOptions: { fetchImpl: fetchReturning(translateHtml) },
    });

    expect(result.map((entry) => entry.appId)).toEqual(appIds);
    for (const [index, entry] of result.entries()) {
      expect(entry.status).toBe('fulfilled');
      if (entry.status === 'fulfilled') {
        expect(entry.app.appId).toBe(appIds[index]);
        expect(entry.app.title.length).toBeGreaterThan(0);
      }
    }
  });

  it('captures a not found id as rejected while the rest fulfill', async () => {
    const appIds = ['com.one', 'com.missing', 'com.three'];
    const fetchImpl: typeof fetch = (input) => {
      const missing = urlOf(input).includes('com.missing');
      return Promise.resolve(
        new Response(missing ? 'nope' : translateHtml, { status: missing ? 404 : 200 }),
      );
    };

    const result = await apps({ appIds, requestOptions: { fetchImpl } });

    expect(result[0]?.status).toBe('fulfilled');
    expect(result[2]?.status).toBe('fulfilled');
    const rejected = result[1];
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.error).toBeInstanceOf(NotFoundError);
      expect(rejected.appId).toBe('com.missing');
    }
  });

  it('wraps a non-google-play failure as GooglePlayError preserving the cause', async () => {
    const boom = new TypeError('kaboom');
    const failing = createApps(() => Promise.reject(boom));

    const result = await failing({ appIds: ['com.x'] });

    const entry = result[0];
    expect(entry?.status).toBe('rejected');
    if (entry?.status === 'rejected') {
      expect(entry.error).toBeInstanceOf(GooglePlayError);
      expect(entry.error.message).toBe('kaboom');
      expect(entry.error.cause).toBe(boom);
    }
  });

  it('honors the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const getApp: GetApp<App> = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return {} as App;
    };
    const batched = createApps(getApp);
    const appIds = Array.from({ length: 12 }, (_unused, index) => `com.app${index.toString()}`);

    await batched({ appIds, concurrency: 3 });

    expect(peak).toBe(3);
  });

  it('rejects empty, zero-concurrency, and oversized batches through validation', async () => {
    await expect(apps({ appIds: [] })).rejects.toBeInstanceOf(ValidationError);
    await expect(apps({ appIds: ['com.a'], concurrency: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );

    const tooMany = Array.from({ length: 251 }, (_unused, index) => `com.app${index.toString()}`);
    await expect(apps({ appIds: tooMany })).rejects.toBeInstanceOf(ValidationError);
  });
});
