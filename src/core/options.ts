import * as z from 'zod/mini';
import type { OnDegradation } from './degradation.js';
import type { OnRequest, OnResponse, OnRetry } from './http.js';
import { ValidationError } from './errors.js';

export const requestOptionsSchema = z.object({
  headers: z.optional(z.record(z.string(), z.string())),
  fetchImpl: z.optional(z.custom<typeof fetch>((value) => typeof value === 'function')),
  timeoutMs: z.optional(z.int().check(z.positive(), z.lte(120000))),
  retries: z.optional(z.int().check(z.gte(0), z.lte(5))),
  signal: z.optional(z.custom<AbortSignal>((value) => value instanceof AbortSignal)),
  onRequest: z.optional(z.custom<OnRequest>((value) => typeof value === 'function')),
  onResponse: z.optional(z.custom<OnResponse>((value) => typeof value === 'function')),
  onRetry: z.optional(z.custom<OnRetry>((value) => typeof value === 'function')),
});

export type RequestOptions = z.infer<typeof requestOptionsSchema>;

export const baseOptionsSchema = z.object({
  lang: z._default(z.string().check(z.minLength(2), z.maxLength(7)), 'en'),
  country: z._default(z.string().check(z.length(2)), 'us'),
  throttle: z.optional(z.number().check(z.positive(), z.lte(50))),
  requestOptions: z.optional(requestOptionsSchema),
  onDegradation: z.optional(z.custom<OnDegradation>((value) => typeof value === 'function')),
});

export type BaseOptions = z.infer<typeof baseOptionsSchema>;

export function normalizeCountry(country: string): string {
  return country.toLowerCase();
}

export function hasUniqueCountriesIgnoringCase(countries: readonly string[]): boolean {
  const normalized = countries.map(normalizeCountry);
  return new Set(normalized).size === normalized.length;
}

export function parseOptions<Schema extends z.core.$ZodType>(
  schema: Schema,
  input: unknown,
  context: string,
): z.infer<Schema> {
  const result = z.core.safeParse(schema, input);
  if (!result.success) {
    throw ValidationError.fromZod(result.error, context);
  }
  return result.data;
}
