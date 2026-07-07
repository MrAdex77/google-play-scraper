import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { datasafety, type DataSafetyOptions } from './datasafety.js';
import { ValidationError } from '../../core/errors.js';

const TRANSLATE = 'com.google.android.apps.translate';

const fixture = readFileSync(
  fileURLToPath(new URL('../../../test/fixtures/datasafety/translate.html', import.meta.url)),
  'utf8',
);

const fetchReturning =
  (body: string): typeof fetch =>
  () =>
    Promise.resolve(new Response(body, { status: 200 }));

describe('datasafety fixture parsing', () => {
  it('extracts collected data entries with data, optional, and purpose fields', async () => {
    const result = await datasafety({
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
    const result = await datasafety({
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
    const result = await datasafety({
      appId: TRANSLATE,
      requestOptions: { fetchImpl: fetchReturning(fixture) },
    });

    expect(result.privacyPolicyUrl).toBeDefined();
    expect(() => new URL(result.privacyPolicyUrl ?? '')).not.toThrow();
  });
});

describe('datasafety guards', () => {
  it('rejects a missing appId with a ValidationError', async () => {
    await expect(datasafety({} as DataSafetyOptions)).rejects.toBeInstanceOf(ValidationError);
  });
});
