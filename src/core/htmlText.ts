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

function decodeNumericReference(codePoint: number): string {
  if (codePoint <= 0 || codePoint > MAX_CODE_POINT) {
    return REPLACEMENT_CHARACTER;
  }
  if (codePoint >= SURROGATE_START && codePoint <= SURROGATE_END) {
    return REPLACEMENT_CHARACTER;
  }
  return String.fromCodePoint(codePoint);
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
  let previous = html;
  let stripped = html.replace(TAGS, '');
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
