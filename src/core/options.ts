import { z } from 'zod';
import type { OnDegradation } from './degradation.js';
import type { OnRequest, OnResponse, OnRetry } from './http.js';
import { ValidationError } from './errors.js';

export const requestOptionsSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  fetchImpl: z.custom<typeof fetch>((value) => typeof value === 'function').optional(),
  timeoutMs: z.number().int().positive().max(120000).optional(),
  retries: z.number().int().min(0).max(5).optional(),
  signal: z.custom<AbortSignal>((value) => value instanceof AbortSignal).optional(),
  onRequest: z.custom<OnRequest>((value) => typeof value === 'function').optional(),
  onResponse: z.custom<OnResponse>((value) => typeof value === 'function').optional(),
  onRetry: z.custom<OnRetry>((value) => typeof value === 'function').optional(),
});

export type RequestOptions = z.infer<typeof requestOptionsSchema>;

export const baseOptionsSchema = z.object({
  lang: z.string().min(2).max(7).default('en'),
  country: z.string().length(2).default('us'),
  throttle: z.number().positive().max(50).optional(),
  requestOptions: requestOptionsSchema.optional(),
  onDegradation: z.custom<OnDegradation>((value) => typeof value === 'function').optional(),
});

export type BaseOptions = z.infer<typeof baseOptionsSchema>;

export function normalizeCountry(country: string): string {
  return country.toLowerCase();
}

export function hasUniqueCountriesIgnoringCase(countries: readonly string[]): boolean {
  const normalized = countries.map(normalizeCountry);
  return new Set(normalized).size === normalized.length;
}

export function parseOptions<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  context: string,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw ValidationError.fromZod(result.error, context);
  }
  return result.data;
}
