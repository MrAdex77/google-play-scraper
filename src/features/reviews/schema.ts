import * as z from 'zod/mini';

export const reviewCriteriaSchema = z.object({
  criteria: z.string(),
  rating: z.nullable(z.number()),
});

export const reviewSchema = z.object({
  id: z.string(),
  userName: z.string(),
  userImage: z.optional(z.url()),
  date: z.iso.datetime(),
  score: z.number().check(z.gte(1), z.lte(5)),
  title: z.optional(z.nullable(z.string())),
  text: z.optional(z.string()),
  replyDate: z.optional(z.iso.datetime()),
  replyText: z.optional(z.string()),
  version: z.optional(z.string()),
  thumbsUp: z.optional(z.number()),
  criterias: z._default(z.array(reviewCriteriaSchema), []),
});

export type Review = z.infer<typeof reviewSchema>;

export const reviewsResultSchema = z.object({
  data: z.array(reviewSchema),
  nextPaginationToken: z.nullable(z.string()),
});

export type ReviewsResult = z.infer<typeof reviewsResultSchema>;
