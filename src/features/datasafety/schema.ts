import * as z from 'zod/mini';

export const dataEntrySchema = z.object({
  data: z.string(),
  optional: z.boolean(),
  purpose: z.optional(z.string()),
  type: z.string(),
});

export const securityPracticeSchema = z.object({
  practice: z.string(),
  description: z.optional(z.string()),
});

export const dataSafetySchema = z.object({
  sharedData: z._default(z.array(dataEntrySchema), []),
  collectedData: z._default(z.array(dataEntrySchema), []),
  securityPractices: z._default(z.array(securityPracticeSchema), []),
  privacyPolicyUrl: z.optional(z.url()),
});

export type DataEntry = z.infer<typeof dataEntrySchema>;
export type SecurityPractice = z.infer<typeof securityPracticeSchema>;
export type DataSafety = z.infer<typeof dataSafetySchema>;
