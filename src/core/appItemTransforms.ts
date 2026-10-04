import { BASE_URL } from '../constants.ts';

const MICROS_PER_UNIT = 1_000_000;

export function resolveAppUrl(value: unknown): string | undefined {
  return typeof value === 'string' ? new URL(value, BASE_URL).toString() : undefined;
}

export function microsToUnits(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value / MICROS_PER_UNIT : undefined;
}

export function isFreeMicros(value: unknown): boolean {
  return value === 0;
}

export function developerIdFromUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return URL.parse(value, BASE_URL)?.searchParams.get('id') ?? undefined;
}
