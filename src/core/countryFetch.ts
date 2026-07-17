import * as z from 'zod/mini';
import { hasUniqueCountriesIgnoringCase, normalizeCountry, parseOptions } from './options.js';

const COUNTRY_QUERY_PARAM = 'gl';
const COUNTRY_FETCH_CONTEXT = 'countryFetch';
const COUNTRY_CODE_PATTERN = /^[a-z]{2}$/i;

const fetchImplSchema = z.custom<typeof fetch>((value) => typeof value === 'function');

export const countryFetchSettingsSchema = z.object({
  perCountry: z
    .record(z.string().check(z.regex(COUNTRY_CODE_PATTERN)), fetchImplSchema)
    .check(
      z.refine(
        (perCountry) => hasUniqueCountriesIgnoringCase(Object.keys(perCountry)),
        'country codes must be unique ignoring case',
      ),
    ),
  fallback: z.optional(fetchImplSchema),
});

export type CountryFetchSettings = z.input<typeof countryFetchSettingsSchema>;

type FetchInput = Parameters<typeof fetch>[0];

function urlOf(input: FetchInput): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function countryOf(input: FetchInput): string | undefined {
  const url = urlOf(input);
  if (!URL.canParse(url)) {
    return undefined;
  }
  const country = new URL(url).searchParams.get(COUNTRY_QUERY_PARAM);
  return country === null ? undefined : normalizeCountry(country);
}

export function createCountryFetch(settings: CountryFetchSettings): typeof fetch {
  const parsed = parseOptions(countryFetchSettingsSchema, settings, COUNTRY_FETCH_CONTEXT);
  const routes = new Map(
    Object.entries(parsed.perCountry).map(([country, impl]) => [normalizeCountry(country), impl]),
  );

  return (input, init) => {
    const country = countryOf(input);
    const route = country === undefined ? undefined : routes.get(country);
    const impl = route ?? parsed.fallback ?? fetch;
    return impl(input, init);
  };
}
