const TAB = 9;
const LINE_FEED = 10;
const CARRIAGE_RETURN = 13;
const UNIT_SEPARATOR = 31;
const DELETE = 127;
const C1_END = 159;
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;

function isPreservedWhitespace(code: number): boolean {
  return code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN;
}

function isControlCharacter(code: number): boolean {
  if (isPreservedWhitespace(code)) {
    return false;
  }
  return code <= UNIT_SEPARATOR || (code >= DELETE && code <= C1_END);
}

function isLoneSurrogate(code: number): boolean {
  return code >= SURROGATE_START && code <= SURROGATE_END;
}

export function sanitizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  let result = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (isControlCharacter(code) || isLoneSurrogate(code)) {
      continue;
    }
    result += character;
  }
  return result;
}
