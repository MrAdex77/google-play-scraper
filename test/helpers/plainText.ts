import * as cheerio from 'cheerio';
import { expect, type MockInstance } from 'vitest';
import { sanitizeText } from '../../src/core/text.ts';
import type { DataSafety } from '../../src/index.ts';

const TAG_NAMES = 'a|b|br|div|em|font|h[1-6]|i|li|ol|p|span|strong|sup|u|ul';
const ATTRIBUTE = String.raw`\s+[a-z-]+=(?:"[^"\n]*"|'[^'\n]*'|[^\s>]+)`;
const MARKUP_TAG = new RegExp(String.raw`</?(?:${TAG_NAMES})(?:${ATTRIBUTE})*\s*/?>`, 'i');
const HTML_ENTITY = /&(?:amp|lt|gt|quot|apos|nbsp|#[0-9]+|#x[0-9a-f]+);/i;
const BR_TAGS = /<br>/g;
const PREVIEW_LENGTH = 80;

export type PlainTextSpy = MockInstance<(value: unknown) => unknown>;

export function legacyDescriptionText(html: string): string {
  const document = cheerio.load(`<div>${html.replace(BR_TAGS, '\r\n')}</div>`);
  return document('div').text();
}

export function oraclePlainText(html: string): string | undefined {
  return sanitizeText(legacyDescriptionText(html));
}

function preview(text: string): string {
  return JSON.stringify(text.slice(0, PREVIEW_LENGTH));
}

function expectOraclePairs(spy: PlainTextSpy, label: string): Set<unknown> {
  const outputs = new Set<unknown>();
  spy.mock.calls.forEach(([input], index) => {
    const output: unknown = spy.mock.results[index]?.value;
    if (typeof input === 'string') {
      expect(output, `${label}: one decode of ${preview(input)}`).toBe(oraclePlainText(input));
    }
    outputs.add(output);
  });
  return outputs;
}

export function expectConvertedOnce(
  spy: PlainTextSpy,
  values: readonly (string | undefined)[],
  label: string,
): void {
  const outputs = expectOraclePairs(spy, label);
  const present = values.filter((value) => value !== undefined);
  expect(present.length, `${label}: at least one value must be present`).toBeGreaterThan(0);
  for (const value of present) {
    expect(outputs.has(value), `${label}: ${preview(value)} must come from plainText`).toBe(true);
  }
}

export function expectHtmlTwin(
  text: string | undefined,
  html: string | undefined,
  label: string,
): void {
  expect(text === undefined, `${label}: text and markup must be present together`).toBe(
    html === undefined,
  );
  if (html !== undefined) {
    expect(text, `${label}: must be its markup decoded once`).toBe(oraclePlainText(html));
  }
}

export function expectHtmlSummaries(
  items: readonly { summary?: string; summaryHTML?: string }[],
  label: string,
): void {
  for (const item of items) {
    expectHtmlTwin(item.summary, item.summaryHTML, `${label} summary`);
  }
}

export function expectConvertedSummaries(
  spy: PlainTextSpy,
  items: readonly { summary?: string }[],
  label: string,
): void {
  expectConvertedOnce(
    spy,
    items.map((item) => item.summary),
    `${label} summary`,
  );
}

function expectGoogleLabelText(text: string | undefined, label: string): void {
  if (text === undefined) {
    return;
  }
  expect(text, `${label}: must not carry a markup tag`).not.toMatch(MARKUP_TAG);
  expect(text, `${label}: must not carry an html entity`).not.toMatch(HTML_ENTITY);
}

export function expectPlainSafetyReport(report: DataSafety, label: string): void {
  for (const entry of [...report.sharedData, ...report.collectedData]) {
    expectGoogleLabelText(entry.data, `${label} ${entry.type} data`);
    expectGoogleLabelText(entry.purpose, `${label} ${entry.data} purpose`);
    expectGoogleLabelText(entry.type, `${label} ${entry.data} type`);
  }
  for (const practice of report.securityPractices) {
    expectGoogleLabelText(practice.practice, `${label} practice`);
    expectGoogleLabelText(practice.description, `${label} ${practice.practice} description`);
    expectHtmlTwin(
      practice.description,
      practice.descriptionHTML,
      `${label} ${practice.practice} description`,
    );
  }
}
