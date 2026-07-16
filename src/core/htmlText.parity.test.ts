import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from './htmlText.js';
import { parseScriptData } from './scriptData.js';
import { extract } from './spec.js';
import { appSpecs } from '../features/app/specs.js';

function legacyDescriptionText(html: string): string {
  const document = cheerio.load(`<div>${html.replace(/<br>/g, '\r\n')}</div>`);
  return document('div').text();
}

const FIXTURE_NAMES = ['translate', 'minecraft', 'whereami'] as const;

function fixtureDescriptionHtml(name: string): string {
  const html = readFileSync(
    fileURLToPath(new URL(`../../test/fixtures/app/${name}.html`, import.meta.url)),
    'utf8',
  );
  const extracted = extract(parseScriptData(html), appSpecs, 'app');
  return extracted.descriptionHTML;
}

const SYNTHETIC_CORPUS = [
  '&amp;',
  '&lt;',
  '&gt;',
  '&quot;',
  '&apos;',
  '&nbsp;',
  '&#65;',
  '&#x41;',
  '&#x1F600;',
  '&amp;lt;',
  '&lt;b&gt;',
  'line one<br>line two',
  'doubled<br><br>break',
  'self closing<br/>tag',
  'spaced self closing<br />tag',
  'uppercase<BR>tag',
  '<b><i>nested</i> inline</b> tags',
  'a bare & ampersand',
  'an &unknown; entity',
  '&#1114112;',
  '&#55296;',
  '',
] as const;

describe('htmlToPlainText parity with the cheerio implementation', () => {
  for (const name of FIXTURE_NAMES) {
    it(`matches cheerio on the ${name} fixture description`, () => {
      const descriptionHtml = fixtureDescriptionHtml(name);
      expect(htmlToPlainText(descriptionHtml)).toBe(legacyDescriptionText(descriptionHtml));
    });
  }

  for (const input of SYNTHETIC_CORPUS) {
    it(`matches cheerio for ${JSON.stringify(input)}`, () => {
      expect(htmlToPlainText(input)).toBe(legacyDescriptionText(input));
    });
  }
});
