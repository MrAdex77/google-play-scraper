import * as z from 'zod/mini';
import { mapWithConcurrency } from '../../core/concurrency.js';
import { GooglePlayError } from '../../core/errors.js';
import type { GetApp } from '../../core/fullDetail.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { app } from '../app/app.js';
import type { App } from '../app/schema.js';

export const appsOptionsSchema = z.extend(baseOptionsSchema, {
  appIds: z.array(z.string().check(z.minLength(1))).check(z.minLength(1), z.maxLength(250)),
  concurrency: z._default(z.int().check(z.gte(1), z.lte(20)), 5),
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
