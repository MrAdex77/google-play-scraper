import { z } from 'zod';
import { mapWithConcurrency } from '../../core/concurrency.js';
import { GooglePlayError } from '../../core/errors.js';
import type { GetApp } from '../../core/fullDetail.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { app } from '../app/app.js';
import type { App } from '../app/schema.js';

export const appsOptionsSchema = baseOptionsSchema.extend({
  appIds: z.array(z.string().min(1)).min(1).max(250),
  concurrency: z.number().int().min(1).max(20).default(5),
});

export type AppsOptions = z.input<typeof appsOptionsSchema>;

export type AppsEntry =
  | { appId: string; status: 'fulfilled'; app: App }
  | { appId: string; status: 'rejected'; error: GooglePlayError };

const APPS_CONTEXT = 'apps';

function toGooglePlayError(cause: unknown): GooglePlayError {
  if (cause instanceof GooglePlayError) {
    return cause;
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  const error = new GooglePlayError(message);
  error.cause = cause;
  return error;
}

export function createApps(getApp: GetApp<App>) {
  return async function apps(options: AppsOptions): Promise<AppsEntry[]> {
    const parsed = parseOptions(appsOptionsSchema, options, APPS_CONTEXT);

    return mapWithConcurrency(
      parsed.appIds,
      parsed.concurrency,
      async (appId): Promise<AppsEntry> => {
        try {
          const result = await getApp({
            appId,
            lang: parsed.lang,
            country: parsed.country,
            throttle: parsed.throttle,
            requestOptions: parsed.requestOptions,
          });
          return { appId, status: 'fulfilled', app: result };
        } catch (error) {
          return { appId, status: 'rejected', error: toGooglePlayError(error) };
        }
      },
    );
  };
}

export const apps = createApps(app);
