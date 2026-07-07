import { z } from 'zod';

export const dataEntrySchema = z.object({
  data: z.string(),
  optional: z.boolean(),
  purpose: z.string().optional(),
  type: z.string(),
});

export const securityPracticeSchema = z.object({
  practice: z.string(),
  description: z.string().optional(),
});

export const dataSafetySchema = z.object({
  sharedData: z.array(dataEntrySchema).default([]),
  collectedData: z.array(dataEntrySchema).default([]),
  securityPractices: z.array(securityPracticeSchema).default([]),
  privacyPolicyUrl: z.url().optional(),
});

export type DataEntry = z.infer<typeof dataEntrySchema>;
export type SecurityPractice = z.infer<typeof securityPracticeSchema>;
export type DataSafety = z.infer<typeof dataSafetySchema>;
