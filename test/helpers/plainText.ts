import { expect } from 'vitest';

const MARKUP_TAG = /<\/?[a-z][^>]*>/i;
const HTML_ENTITY = /&(?:amp|lt|gt|quot|apos|nbsp|#[0-9]+|#x[0-9a-f]+);/i;

export function expectPlainText(text: string | undefined, label: string): void {
  if (text === undefined) {
    return;
  }
  expect(text, `${label}: must not carry a markup tag`).not.toMatch(MARKUP_TAG);
  expect(text, `${label}: must not carry an html entity`).not.toMatch(HTML_ENTITY);
}

export function expectPlainSummaries(items: readonly { appId: string; summary?: string }[]): void {
  for (const item of items) {
    expectPlainText(item.summary, `${item.appId} summary`);
  }
}
