import * as z from 'zod/mini';
import { BASE_URL } from '../../constants.ts';
import { clientFromOptions, type ResolveClient } from '../../core/http.ts';
import { baseOptionsSchema, parseOptions } from '../../core/options.ts';
import { parseScriptData } from '../../core/scriptData.ts';
import { resolveScriptRoot } from '../../core/scriptRoot.ts';
import { extract } from '../../core/spec.ts';
import { appSchema, type App } from './schema.ts';
import {
  appCommentsRootSpec,
  appDetailsRootSpec,
  appScriptDataSelection,
  appSpecs,
} from './specs.ts';
import { extractComments } from './transforms.ts';

export const appOptionsSchema = z.extend(baseOptionsSchema, {
  appId: z.string().check(z.minLength(1)),
});

export type AppOptions = z.input<typeof appOptionsSchema>;

const DETAILS_URL = `${BASE_URL}/store/apps/details`;

export function createApp(resolveClient: ResolveClient = clientFromOptions) {
  return async function app(options: AppOptions): Promise<App> {
    const parsed = parseOptions(appOptionsSchema, options, 'app');

    const params = new URLSearchParams({
      id: parsed.appId,
      hl: parsed.lang,
      gl: parsed.country,
    });
    const url = `${DETAILS_URL}?${params.toString()}`;

    const client = resolveClient(parsed);
    const html = await client.request({ url });
    const data = parseScriptData(html, appScriptDataSelection);
    const details = resolveScriptRoot(
      data,
      appDetailsRootSpec,
      'app details',
      parsed.onIntegrityEvent,
    );
    const comments = resolveScriptRoot(
      data,
      appCommentsRootSpec,
      'app comments',
      parsed.onIntegrityEvent,
    );
    const extracted = extract(details.root, appSpecs, 'app');

    return appSchema.parse({
      ...extracted,
      appId: parsed.appId,
      url,
      comments: extractComments(comments.root),
    });
  };
}

export const app = createApp();
