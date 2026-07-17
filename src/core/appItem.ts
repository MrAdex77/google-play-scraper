import * as z from 'zod/mini';

export const appItemSchema = z.object({
  title: z.string(),
  appId: z.string(),
  url: z.string(),
  icon: z.string(),
  developer: z.string(),
  developerId: z.optional(z.string()),
  currency: z.optional(z.string()),
  price: z.number(),
  free: z.boolean(),
  summary: z.optional(z.string()),
  scoreText: z.optional(z.string()),
  score: z.optional(z.number().check(z.gte(0), z.lte(5))),
});

export type AppItem = z.infer<typeof appItemSchema>;
