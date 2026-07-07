import { z } from 'zod';

export const reviewCriteriaSchema = z.object({
  criteria: z.string(),
  rating: z.number().nullable(),
});

export const reviewSchema = z.object({
  id: z.string(),
  userName: z.string(),
  userImage: z.url().optional(),
  date: z.iso.datetime(),
  score: z.number().min(1).max(5),
  title: z.string().nullable().optional(),
  text: z.string().optional(),
  replyDate: z.iso.datetime().optional(),
  replyText: z.string().optional(),
  version: z.string().optional(),
  thumbsUp: z.number().optional(),
  criterias: z.array(reviewCriteriaSchema).default([]),
});

export type Review = z.infer<typeof reviewSchema>;

export const reviewsResultSchema = z.object({
  data: z.array(reviewSchema),
  nextPaginationToken: z.string().nullable(),
});

export type ReviewsResult = z.infer<typeof reviewsResultSchema>;
