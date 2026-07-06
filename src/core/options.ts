import { z } from 'zod';
import { ValidationError } from './errors.js';

export const requestOptionsSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  fetchImpl: z.custom<typeof fetch>((value) => typeof value === 'function').optional(),
  timeoutMs: z.number().int().positive().max(120000).optional(),
  retries: z.number().int().min(0).max(5).optional(),
});

export type RequestOptions = z.infer<typeof requestOptionsSchema>;

export const baseOptionsSchema = z.object({
  lang: z.string().min(2).max(7).default('en'),
  country: z.string().length(2).default('us'),
  throttle: z.number().positive().max(50).optional(),
  requestOptions: requestOptionsSchema.optional(),
});

export type BaseOptions = z.infer<typeof baseOptionsSchema>;

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
