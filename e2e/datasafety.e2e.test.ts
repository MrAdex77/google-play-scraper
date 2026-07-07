import { describe, expect, it } from 'vitest';
import { datasafety } from '../src/index.js';

const TRANSLATE = 'com.google.android.apps.translate';

describe('datasafety live contract', () => {
  it('returns collected data, security practices, and a privacy policy url', async () => {
    const result = await datasafety({ appId: TRANSLATE });

    expect(result.collectedData.length).toBeGreaterThan(0);
    for (const entry of result.collectedData) {
      expect(typeof entry.data).toBe('string');
      expect(entry.data.length).toBeGreaterThan(0);
      expect(typeof entry.optional).toBe('boolean');
    }

    expect(result.securityPractices.length).toBeGreaterThan(0);
    for (const practice of result.securityPractices) {
      expect(practice.practice.length).toBeGreaterThan(0);
    }

    expect(result.privacyPolicyUrl?.startsWith('http')).toBe(true);
  });
});
