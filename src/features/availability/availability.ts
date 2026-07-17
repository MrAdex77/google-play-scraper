import * as z from 'zod/mini';
import { BASE_URL } from '../../constants.js';
import { mapWithConcurrency } from '../../core/concurrency.js';
import { NotFoundError } from '../../core/errors.js';
import { clientFromOptions, type ResolveClient } from '../../core/http.js';
import {
  hasUniqueCountriesIgnoringCase,
  normalizeCountry,
  parseOptions,
  requestOptionsSchema,
} from '../../core/options.js';
import {
  availabilityResultSchema,
  type AvailabilityResult,
  type CountryAvailability,
} from './schema.js';

const countryCodeSchema = z.string().check(z.regex(/^[a-z]{2}$/i));

export const availabilityOptionsSchema = z.object({
  appId: z.string().check(z.minLength(1)),
  countries: z
    .array(countryCodeSchema)
    .check(
      z.minLength(1),
      z.maxLength(50),
      z.refine(hasUniqueCountriesIgnoringCase, 'country codes must be unique ignoring case'),
    ),
  lang: z._default(z.string().check(z.minLength(2), z.maxLength(7)), 'en'),
  concurrency: z._default(z.int().check(z.gte(1), z.lte(20)), 5),
  throttle: z.optional(z.number().check(z.positive(), z.lte(50))),
  requestOptions: z.optional(requestOptionsSchema),
});

export type AvailabilityOptions = z.input<typeof availabilityOptionsSchema>;

const AVAILABILITY_CONTEXT = 'availability';
const DETAILS_URL = `${BASE_URL}/store/apps/details`;

function toCountryAvailability(error: unknown): CountryAvailability {
  if (error instanceof NotFoundError) {
    return { status: 'unavailable' };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { status: 'error', message };
}

export function createAvailability(resolveClient: ResolveClient = clientFromOptions) {
  return async function availability(options: AvailabilityOptions): Promise<AvailabilityResult> {
    const parsed = parseOptions(availabilityOptionsSchema, options, AVAILABILITY_CONTEXT);
    const countries = parsed.countries.map(normalizeCountry);
    const client = resolveClient(parsed);

    const probe = async (country: string): Promise<CountryAvailability> => {
      const params = new URLSearchParams({ id: parsed.appId, hl: parsed.lang, gl: country });
      const url = `${DETAILS_URL}?${params.toString()}`;
      try {
        await client.request({ url });
        return { status: 'available' };
      } catch (error) {
        return toCountryAvailability(error);
      }
    };

    const outcomes = await mapWithConcurrency(countries, parsed.concurrency, probe);

    const byCountry: Record<string, CountryAvailability> = {};
    for (const [index, country] of countries.entries()) {
      const outcome = outcomes[index];
      if (outcome !== undefined) {
        byCountry[country] = outcome;
      }
    }

    return availabilityResultSchema.parse({ appId: parsed.appId, countries: byCountry });
  };
}

export const availability = createAvailability();
