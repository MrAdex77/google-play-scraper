import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from './htmlText.ts';
import { sanitizeText } from './text.ts';
import { getPath } from './path.ts';
import { parseScriptData } from './scriptData.ts';
import { resolveScriptRoot } from './scriptRoot.ts';
import { extract } from './spec.ts';
import { appDetailsRootSpec, appSpecs } from '../features/app/specs.ts';
import { cheerioText } from '../../test/helpers/plainText.ts';

const FIXTURE_NAMES = ['translate', 'minecraft', 'whereami'] as const;

function fixtureDetailsRoot(name: string): unknown {
  const html = readFileSync(
    fileURLToPath(new URL(`../../test/fixtures/app/${name}.html`, import.meta.url)),
    'utf8',
  );
  return resolveScriptRoot(parseScriptData(html), appDetailsRootSpec, 'app details').root;
}

function fixtureDescriptionHtml(name: string): string {
  return extract(fixtureDetailsRoot(name), appSpecs, 'app').descriptionHTML;
}

function fixtureRecentChangesHtml(name: string): string {
  const changes = getPath(fixtureDetailsRoot(name), [1, 2, 144, 1, 1]);
  if (typeof changes !== 'string') {
    throw new Error(`${name} fixture has no changelog at the recorded path`);
  }
  return changes;
}

const SYNTHETIC_CORPUS = [
  'Hunt &amp; Explore',
  'Hole Stars<br><br>It&#39;s &quot;fun&quot; &gt; all<br>Terms: https://example.com/?a=1&amp;b=2',
  '<b>Blix</b> app </b>, with<u>under</u>line <br> <br>spaced',
  '&#8226; Modern Android &amp; Android TV UI<br>&#8226; Fixes',
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
  'wait&#133; it&#146;s here &#150; now&#153;',
  '<div><p>Real ones order here</p><br><div>nested <b>deal</b></div></div><br>tail',
  'unclosed </div> wrapper <div>text',
  '&#x80;&#x82;&#x8A;&#x8C;&#x8E;&#x9C;&#x9E;&#x9F;',
] as const;

const WINDOWS_1252_RANGE = Array.from(
  { length: 32 },
  (_, offset) => `&#${(0x80 + offset).toString()};`,
);

describe('htmlToPlainText parity with the cheerio implementation', () => {
  for (const name of FIXTURE_NAMES) {
    it(`matches cheerio on the ${name} fixture description`, () => {
      const descriptionHtml = fixtureDescriptionHtml(name);
      expect(htmlToPlainText(descriptionHtml)).toBe(cheerioText(descriptionHtml));
    });
  }

  for (const name of FIXTURE_NAMES) {
    it(`matches cheerio on the ${name} fixture changelog`, () => {
      const changelogHtml = fixtureRecentChangesHtml(name);
      expect(htmlToPlainText(changelogHtml)).toBe(cheerioText(changelogHtml));
    });
  }

  for (const reference of WINDOWS_1252_RANGE) {
    it(`matches cheerio for the windows-1252 reference ${reference}`, () => {
      expect(sanitizeText(htmlToPlainText(reference))).toBe(sanitizeText(cheerioText(reference)));
    });
  }

  for (const input of SYNTHETIC_CORPUS) {
    it(`matches cheerio for ${JSON.stringify(input)}`, () => {
      expect(htmlToPlainText(input)).toBe(cheerioText(input));
    });
  }
});
