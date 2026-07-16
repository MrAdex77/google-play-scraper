import * as cheerio from 'cheerio';
import { expect, it } from 'vitest';
import { htmlToPlainText } from '../src/core/htmlText.js';
import { sanitizeText } from '../src/core/text.js';
import { liveClient, liveDescribe } from './helpers.js';

function legacyDescriptionText(html: string): string {
  const document = cheerio.load(`<div>${html.replace(/<br>/g, '\r\n')}</div>`);
  return document('div').text();
}

const SUPPORTED_NAMED_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos', 'nbsp']);
const ALLOWED_TAG = /^<\/?(?:b|i|u|br)\s*\/?>$/;
const TAG_SCAN = /<[^>]*>/g;
const NAMED_ENTITY_SCAN = /&([a-zA-Z]+);/g;
const NUMERIC_ENTITY_SCAN = /&#([0-9]+);|&#[xX]([0-9a-fA-F]+);/g;
const C1_START = 0x80;
const C1_END = 0x9f;

function unsupportedNamedEntities(html: string): string[] {
  const offenders: string[] = [];
  for (const match of html.matchAll(NAMED_ENTITY_SCAN)) {
    const name = match[1];
    if (name !== undefined && !SUPPORTED_NAMED_ENTITIES.has(name)) {
      offenders.push(match[0]);
    }
  }
  return offenders;
}

function c1NumericReferences(html: string): string[] {
  const offenders: string[] = [];
  for (const match of html.matchAll(NUMERIC_ENTITY_SCAN)) {
    const codePoint =
      match[1] !== undefined ? Number.parseInt(match[1], 10) : Number.parseInt(match[2] ?? '', 16);
    if (codePoint >= C1_START && codePoint <= C1_END) {
      offenders.push(match[0]);
    }
  }
  return offenders;
}

function unexpectedTags(html: string): string[] {
  const offenders: string[] = [];
  for (const match of html.matchAll(TAG_SCAN)) {
    if (!ALLOWED_TAG.test(match[0])) {
      offenders.push(match[0]);
    }
  }
  return [...new Set(offenders)];
}

const DESCRIPTION_BASKET = [
  { appId: 'com.google.android.apps.translate', lang: 'en', country: 'us', script: 'latin' },
  { appId: 'com.mojang.minecraftpe', lang: 'en', country: 'us', script: 'latin paid' },
  { appId: 'com.adex77.WhereAmI', lang: 'pl', country: 'pl', script: 'polish localized' },
  { appId: 'jp.naver.line.android', lang: 'ja', country: 'jp', script: 'japanese' },
  { appId: 'com.kakao.talk', lang: 'ko', country: 'kr', script: 'korean' },
  { appId: 'com.whatsapp', lang: 'ar', country: 'sa', script: 'arabic rtl' },
  { appId: 'org.telegram.messenger', lang: 'ru', country: 'ru', script: 'cyrillic' },
  { appId: 'com.google.android.youtube', lang: 'hi', country: 'in', script: 'devanagari' },
  { appId: 'com.waze', lang: 'he', country: 'il', script: 'hebrew rtl' },
  { appId: 'com.king.candycrushsaga', lang: 'en', country: 'us', script: 'emoji rich' },
] as const;

liveDescribe('description live parity without cheerio', () => {
  for (const { appId, lang, country, script } of DESCRIPTION_BASKET) {
    it(`matches the legacy cheerio pipeline for ${appId} (${script}, ${lang}-${country})`, async () => {
      const result = await liveClient.app({ appId, lang, country });
      const html = result.descriptionHTML;

      expect(html.length).toBeGreaterThan(0);
      expect(result.description.length).toBeGreaterThan(0);

      expect(htmlToPlainText(html)).toBe(legacyDescriptionText(html));
      expect(result.description).toBe(sanitizeText(htmlToPlainText(html)));

      expect(
        unsupportedNamedEntities(html),
        `${appId} serves named entities outside the supported set`,
      ).toEqual([]);
      expect(
        c1NumericReferences(html),
        `${appId} serves C1 numeric references that cheerio remaps via windows-1252`,
      ).toEqual([]);
      expect(
        unexpectedTags(html),
        `${appId} serves markup beyond the bare inline tags the decoder assumes`,
      ).toEqual([]);

      expect(result.description.includes('\r')).toBe(false);
      if (html.includes('<br>')) {
        expect(result.description).toContain('\n');
      }
    });
  }
});
