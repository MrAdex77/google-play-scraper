import { z } from 'zod';

export const appItemSchema = z.object({
  title: z.string(),
  appId: z.string(),
  url: z.string(),
  icon: z.string(),
  developer: z.string(),
  developerId: z.string().optional(),
  currency: z.string().optional(),
  price: z.number(),
  free: z.boolean(),
  summary: z.string().optional(),
  scoreText: z.string().optional(),
  score: z.number().min(0).max(5).optional(),
});

export type AppItem = z.infer<typeof appItemSchema>;
