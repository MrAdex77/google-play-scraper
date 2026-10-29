import { expect } from 'vitest';
import type { ContinuationAnchor } from './contracts.ts';
import { fieldCoverage } from './coverage.ts';

export function expectFieldFilledSomewhere(
  context: string,
  items: readonly Record<string, unknown>[],
  fields: readonly string[],
): void {
  for (const field of fields) {
    const { filled, total } = fieldCoverage(items, field);
    const message = `${context}: field "${field}" is empty across all ${total.toString()} items, the optional path drifted onto nothing`;
    expect(filled, message).toBeGreaterThan(0);
  }
}

export function expectFieldFilledOnEachPageShape(
  context: string,
  items: readonly Record<string, unknown>[],
  anchor: ContinuationAnchor,
  fields: readonly string[],
): void {
  const continuation = items.slice(anchor.firstPageCount);
  expect(
    continuation.length,
    `${context}: the aggregate never crossed the ${anchor.firstPageCount.toString()} items of the first page, so there is no continuation shape to check`,
  ).toBeGreaterThan(0);
  expectFieldFilledSomewhere(
    `${context} first page`,
    items.slice(0, anchor.firstPageCount),
    fields,
  );
  expectFieldFilledSomewhere(`${context} continuation`, continuation, fields);
}
