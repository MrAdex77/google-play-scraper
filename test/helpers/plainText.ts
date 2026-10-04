import { expect } from 'vitest';

const TAG_NAMES = 'a|b|br|div|em|font|h[1-6]|i|li|ol|p|span|strong|sup|u|ul';
const ATTRIBUTE = String.raw`\s+[a-z-]+=(?:"[^"\n]*"|'[^'\n]*'|[^\s>]+)`;
const MARKUP_TAG = new RegExp(String.raw`</?(?:${TAG_NAMES})(?:${ATTRIBUTE})*\s*/?>`, 'i');
const HTML_ENTITY = /&(?:amp|lt|gt|quot|apos|nbsp|#[0-9]+|#x[0-9a-f]+);/i;

export function expectPlainText(text: string | undefined, label: string): void {
  if (text === undefined) {
    return;
  }
  expect(text, `${label}: must not carry a markup tag`).not.toMatch(MARKUP_TAG);
  expect(text, `${label}: must not carry an html entity`).not.toMatch(HTML_ENTITY);
}

export function expectPlainSummaries(items: readonly { appId: string; summary?: string }[]): void {
  expect(
    items.some((item) => item.summary !== undefined),
    'at least one item must carry a summary',
  ).toBe(true);
  for (const item of items) {
    expectPlainText(item.summary, `${item.appId} summary`);
  }
}
