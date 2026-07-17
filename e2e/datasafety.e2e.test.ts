import { expect, it } from 'vitest';
import { liveClient, liveDescribe } from './helpers.js';

const TRANSLATE = 'com.google.android.apps.translate';

liveDescribe('datasafety live contract', () => {
  it('returns collected data, security practices, and a privacy policy url', async () => {
    const result = await liveClient.dataSafety({ appId: TRANSLATE });

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

  it('returns a typed safety report for the Where Am I geography game', async () => {
    const result = await liveClient.dataSafety({ appId: 'com.adex77.WhereAmI' });

    expect(Array.isArray(result.sharedData)).toBe(true);
    expect(Array.isArray(result.collectedData)).toBe(true);
    expect(Array.isArray(result.securityPractices)).toBe(true);
    for (const entry of [...result.sharedData, ...result.collectedData]) {
      expect(entry.data.length).toBeGreaterThan(0);
      expect(typeof entry.optional).toBe('boolean');
      expect(entry.type.length).toBeGreaterThan(0);
    }
    expect(result.privacyPolicyUrl?.startsWith('http')).toBe(true);
  });

  it('returns an empty report instead of throwing for a missing app', async () => {
    const result = await liveClient.dataSafety({
      appId: 'com.adex77.definitely.not.a.real.app',
    });

    expect(result.sharedData).toEqual([]);
    expect(result.collectedData).toEqual([]);
    expect(result.securityPractices).toEqual([]);
    expect(result.privacyPolicyUrl).toBeUndefined();
  });
});
