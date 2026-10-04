import { expect, it } from 'vitest';
import type { IntegrityEvent } from '../src/index.ts';
import { expectPlainSafetyReport } from '../test/helpers/plainText.ts';
import { liveClient, liveDescribe } from './helpers.ts';

const TRANSLATE = 'com.google.android.apps.translate';
const MISSING_APP = 'com.adex77.definitely.not.a.real.app';
const UNAVAILABLE_EVERYWHERE_APP = 'br.com.itau';
const STOREFRONT_RESTRICTED_APP = 'com.vkontakte.android';
const REGIONAL_PRACTICE_APP = 'com.phonepe.app';
const SECTIONLESS_APPS = ['com.google.android.gms', 'com.chucklefish.stardewvalley'];
const LINKED_PRACTICES_APP = 'com.google.android.apps.youtube.kids';
const LINKED_PRACTICE_STOREFRONTS = [
  { lang: 'en', country: 'us' },
  { lang: 'ja', country: 'jp' },
  { lang: 'ar', country: 'sa' },
  { lang: 'de', country: 'de' },
] as const;
const MISSING_APP_LANGUAGES = ['en', 'pt', 'de', 'ja', 'ar', 'ru', 'fr', 'zh', 'pl', 'ko'];
const REAL_APP_LANGUAGES = ['pt', 'ja', 'ar', 'ru'];
const SECTIONLESS_CASES = SECTIONLESS_APPS.flatMap((appId) =>
  ['en', 'pt', 'ja'].map((lang) => ({ appId, lang })),
);

const EMPTY_REPORT = {
  sharedData: [],
  collectedData: [],
  securityPractices: [],
  privacyPolicyUrl: undefined,
};

liveDescribe('datasafety live contract', () => {
  it('returns collected data, security practices, and a privacy policy url', async () => {
    const events: IntegrityEvent[] = [];
    const result = await liveClient.dataSafety({
      appId: TRANSLATE,
      onIntegrityEvent: (event) => events.push(event),
    });

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
    expect(events).toEqual([]);
    expectPlainSafetyReport(result, 'translate');
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
    expectPlainSafetyReport(result, 'where am i');
  });

  it('returns shared data entries with purposes for a data rich social app', async () => {
    const result = await liveClient.dataSafety({ appId: 'com.instagram.android' });

    expect(result.sharedData.length).toBeGreaterThan(0);
    expect(result.collectedData.length).toBeGreaterThan(0);
    for (const entry of [...result.sharedData, ...result.collectedData]) {
      expect(entry.data.length).toBeGreaterThan(0);
      expect(entry.type.length).toBeGreaterThan(0);
      expect(typeof entry.optional).toBe('boolean');
      if (entry.purpose !== undefined) {
        expect(entry.purpose.length).toBeGreaterThan(0);
      }
    }
    expect(result.sharedData.some((entry) => entry.purpose !== undefined)).toBe(true);
    expectPlainSafetyReport(result, 'instagram');
  });

  it('localizes the safety report labels for a polish storefront', async () => {
    const defaultReport = await liveClient.dataSafety({ appId: 'com.adex77.WhereAmI' });
    const polishReport = await liveClient.dataSafety({ appId: 'com.adex77.WhereAmI', lang: 'pl' });

    expect(polishReport.collectedData.length).toBe(defaultReport.collectedData.length);
    expect(polishReport.securityPractices.length).toBe(defaultReport.securityPractices.length);
    expect(polishReport.collectedData.length).toBeGreaterThan(0);
    expect(polishReport.securityPractices.length).toBeGreaterThan(0);

    const defaultTypes = defaultReport.collectedData.map((entry) => entry.type);
    const polishTypes = polishReport.collectedData.map((entry) => entry.type);
    expect(polishTypes).not.toEqual(defaultTypes);

    const defaultPractices = defaultReport.securityPractices.map((entry) => entry.practice);
    const polishPractices = polishReport.securityPractices.map((entry) => entry.practice);
    expect(polishPractices).not.toEqual(defaultPractices);

    for (const entry of polishReport.collectedData) {
      expect(entry.data.length).toBeGreaterThan(0);
      expect(entry.type.length).toBeGreaterThan(0);
    }
    expectPlainSafetyReport(polishReport, 'polish where am i');
  });

  it('returns plain text security practice descriptions that google serves with links', async () => {
    for (const { lang, country } of LINKED_PRACTICE_STOREFRONTS) {
      const report = await liveClient.dataSafety({ appId: LINKED_PRACTICES_APP, lang, country });
      const described = report.securityPractices.filter(
        (practice) => (practice.description?.length ?? 0) > 0,
      );

      expectPlainSafetyReport(report, `${country} youtube kids`);
      expect(described.length, `${country}: described practices`).toBeGreaterThan(0);
    }
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

  it.each(MISSING_APP_LANGUAGES)(
    'returns an empty report for a missing app in %s',
    async (lang) => {
      const result = await liveClient.dataSafety({ appId: MISSING_APP, lang });

      expect(result).toEqual(EMPTY_REPORT);
    },
  );

  it('returns an empty report for an app Google Play serves nowhere, in its own storefront', async () => {
    const result = await liveClient.dataSafety({
      appId: UNAVAILABLE_EVERYWHERE_APP,
      country: 'br',
      lang: 'pt',
    });

    expect(result).toEqual(EMPTY_REPORT);
  });

  it.each(REAL_APP_LANGUAGES)('returns the real report for a listed app in %s', async (lang) => {
    const events: IntegrityEvent[] = [];
    const result = await liveClient.dataSafety({
      appId: TRANSLATE,
      lang,
      onIntegrityEvent: (event) => events.push(event),
    });

    expect(result.collectedData.length).toBeGreaterThan(0);
    expect(result.securityPractices.length).toBeGreaterThan(0);
    expect(events).toEqual([]);
    expectPlainSafetyReport(result, `translate ${lang}`);
  });

  it.each(SECTIONLESS_CASES)(
    'resolves $appId in $lang without integrity events although its safety section may be empty',
    async ({ appId, lang }) => {
      const events: IntegrityEvent[] = [];
      const result = await liveClient.dataSafety({
        appId,
        lang,
        onIntegrityEvent: (event) => events.push(event),
      });

      expect(Array.isArray(result.sharedData)).toBe(true);
      expect(Array.isArray(result.collectedData)).toBe(true);
      expect(Array.isArray(result.securityPractices)).toBe(true);
      expect(events).toEqual([]);
    },
  );

  it('honors the storefront country for an app that is not offered in every country', async () => {
    const offered = await liveClient.dataSafety({
      appId: STOREFRONT_RESTRICTED_APP,
      country: 'us',
    });
    const withheld = await liveClient.dataSafety({
      appId: STOREFRONT_RESTRICTED_APP,
      country: 'de',
    });

    expect(offered.collectedData.length).toBeGreaterThan(0);
    expect(withheld).toEqual(EMPTY_REPORT);
  });

  it('returns the same report content for a worldwide app in two storefronts', async () => {
    const asEntries = (entries: readonly object[]): string[] =>
      entries.map((entry) => JSON.stringify(entry)).sort();
    const american = await liveClient.dataSafety({ appId: TRANSLATE, country: 'us' });
    const german = await liveClient.dataSafety({ appId: TRANSLATE, country: 'de' });

    expect(asEntries(german.collectedData)).toEqual(asEntries(american.collectedData));
    expect(asEntries(german.securityPractices)).toEqual(asEntries(american.securityPractices));
  });

  it('adds the regional security practices of the requested storefront', async () => {
    const practicesIn = async (country: string): Promise<string[]> => {
      const report = await liveClient.dataSafety({ appId: REGIONAL_PRACTICE_APP, country });
      return report.securityPractices.map((entry) => entry.practice);
    };
    const american = await practicesIn('us');
    const indian = await practicesIn('in');

    expect(american.length).toBeGreaterThan(0);
    expect(indian).toEqual(expect.arrayContaining(american));
    expect(indian.filter((practice) => !american.includes(practice))).toContain(
      'UPI payments verified',
    );
  });
});
