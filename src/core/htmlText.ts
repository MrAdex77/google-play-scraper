import { sanitizeText } from './text.ts';

const BR_TAGS = /<br>/g;
const CARRIAGE_RETURNS = /\r\n?/g;
const TAGS = /<[^>]*>/g;
const ENTITIES = /&#[0-9]+;|&#[xX][0-9a-fA-F]+;|&[a-zA-Z]+;/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

const REPLACEMENT_CHARACTER = '\ufffd';
const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;

const WINDOWS_1252_REFERENCES = new Map<number, number>([
  [0x80, 0x20ac],
  [0x82, 0x201a],
  [0x83, 0x0192],
  [0x84, 0x201e],
  [0x85, 0x2026],
  [0x86, 0x2020],
  [0x87, 0x2021],
  [0x88, 0x02c6],
  [0x89, 0x2030],
  [0x8a, 0x0160],
  [0x8b, 0x2039],
  [0x8c, 0x0152],
  [0x8e, 0x017d],
  [0x91, 0x2018],
  [0x92, 0x2019],
  [0x93, 0x201c],
  [0x94, 0x201d],
  [0x95, 0x2022],
  [0x96, 0x2013],
  [0x97, 0x2014],
  [0x98, 0x02dc],
  [0x99, 0x2122],
  [0x9a, 0x0161],
  [0x9b, 0x203a],
  [0x9c, 0x0153],
  [0x9e, 0x017e],
  [0x9f, 0x0178],
]);

function decodeNumericReference(codePoint: number): string {
  if (codePoint <= 0 || codePoint > MAX_CODE_POINT) {
    return REPLACEMENT_CHARACTER;
  }
  if (codePoint >= SURROGATE_START && codePoint <= SURROGATE_END) {
    return REPLACEMENT_CHARACTER;
  }
  return String.fromCodePoint(WINDOWS_1252_REFERENCES.get(codePoint) ?? codePoint);
}

function decodeEntity(match: string): string {
  const body = match.slice(1, -1);
  if (body.startsWith('#x') || body.startsWith('#X')) {
    return decodeNumericReference(Number.parseInt(body.slice(2), 16));
  }
  if (body.startsWith('#')) {
    return decodeNumericReference(Number.parseInt(body.slice(1), 10));
  }
  return NAMED_ENTITIES[body] ?? match;
}

function stripTags(html: string): string {
  let stripped = html;
  let previous = '';
  while (stripped !== previous) {
    previous = stripped;
    stripped = stripped.replace(TAGS, '');
  }
  return stripped;
}

export function htmlToPlainText(html: string): string {
  const normalized = html.replace(BR_TAGS, '\r\n').replace(CARRIAGE_RETURNS, '\n');
  return stripTags(normalized).replace(ENTITIES, decodeEntity);
}

export function plainText(value: unknown): unknown {
  return typeof value === 'string' ? sanitizeText(htmlToPlainText(value)) : value;
}

export function htmlText(value: unknown): unknown {
  return typeof value === 'string' ? sanitizeText(value) : value;
}
