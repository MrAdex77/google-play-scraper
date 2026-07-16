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
  '&#X41;',
  '&#xA0;',
  '&#x1F600;',
  '&#39;',
  '&#9;',
  '&#10;',
  '&#13;',
  '&#8226; bullet &#8211; dash',
  '&amp;lt;',
  '&lt;b&gt;',
  '&lt;br&gt;',
  'line one<br>line two',
  'doubled<br><br>break',
  '<br>leading',
  'trailing<br>',
  '<br>',
  'self closing<br/>tag',
  'spaced self closing<br />tag',
  'uppercase<BR>tag',
  'space before bracket<br >tag',
  '<b><i>nested</i> inline</b> tags',
  '<b >spaced brackets</b >',
  '<b class="x">attributed</b>',
  '<!-- comment -->',
  'a bare & ampersand',
  'an &unknown; entity',
  '&am p;',
  '&#xg;',
  '&#;',
  '&#1114112;',
  '&#x10FFFF;',
  '&#x110000;',
  '&#55296;',
  '&#0;',
  'emoji \u{1f3ae}\u{1f30d} raw',
  'rtl a\u200fb mark',
  '',
  'mixed <b>Bold &amp; &#39;quoted&#39;</b><br>next &lt;line&gt;',
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
