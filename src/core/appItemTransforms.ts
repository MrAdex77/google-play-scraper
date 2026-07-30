import { BASE_URL } from '../constants.js';

const MICROS_PER_UNIT = 1_000_000;

export function resolveAppUrl(value: unknown): string | undefined {
  return typeof value === 'string' ? new URL(value, BASE_URL).toString() : undefined;
}

export function microsToUnits(value: unknown): number | undefined {
  return typeof value === 'number' ? value / MICROS_PER_UNIT || 0 : undefined;
}

export function isFreeMicros(value: unknown): boolean {
  return value === 0;
}
