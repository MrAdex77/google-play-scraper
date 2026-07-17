import * as z from 'zod/mini';

export const countryAvailabilitySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('available') }),
  z.object({ status: z.literal('unavailable') }),
  z.object({ status: z.literal('error'), message: z.string() }),
]);

export const availabilityResultSchema = z.object({
  appId: z.string(),
  countries: z.record(z.string().check(z.length(2)), countryAvailabilitySchema),
});

export type CountryAvailability = z.infer<typeof countryAvailabilitySchema>;
export type AvailabilityResult = z.infer<typeof availabilityResultSchema>;
