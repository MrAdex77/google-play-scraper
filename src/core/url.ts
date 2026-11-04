import { BASE_URL } from '../constants.ts';

const APP_DETAILS_URL = `${BASE_URL}/store/apps/details`;

export function appDetailsUrl(query: Record<string, string>): string {
  return `${APP_DETAILS_URL}?${new URLSearchParams(query).toString()}`;
}

export function parseUrl(input: string, base?: string): URL | undefined {
  try {
    return new URL(input, base);
  } catch {
    return undefined;
  }
}
