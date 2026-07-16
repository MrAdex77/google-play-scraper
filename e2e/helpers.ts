import { describe, expect } from 'vitest';
import { createClient } from '../src/index.js';
import { fieldCoverage } from './coverage.js';

const LIVE_TESTS_DISABLED = process.env.GP_E2E === '0';

const REQUESTS_PER_SECOND = 1;

export const liveDescribe = describe.skipIf(LIVE_TESTS_DISABLED);

export const liveClient = createClient({ throttle: REQUESTS_PER_SECOND });

export function expectFieldCoverage(
  context: string,
  items: readonly Record<string, unknown>[],
  thresholds: Readonly<Record<string, number>>,
): void {
  for (const [field, minimum] of Object.entries(thresholds)) {
    const { filled, total, ratio } = fieldCoverage(items, field);
    const message = `${context}: field "${field}" coverage ${ratio.toFixed(2)} below ${minimum.toString()} (${filled.toString()}/${total.toString()})`;
    expect.soft(ratio, message).toBeGreaterThanOrEqual(minimum);
  }
}
