import { z } from 'zod';
import { BASE_URL } from '../../constants.js';
import { clientFromOptions } from '../../core/http.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { parseScriptData } from '../../core/scriptData.js';
import { extract } from '../../core/spec.js';
import { appSchema, type App } from './schema.js';
import { appSpecs } from './specs.js';

export const appOptionsSchema = baseOptionsSchema.extend({
  appId: z.string().min(1),
});

export type AppOptions = z.input<typeof appOptionsSchema>;

const DETAILS_URL = `${BASE_URL}/store/apps/details`;

export async function app(options: AppOptions): Promise<App> {
  const parsed = parseOptions(appOptionsSchema, options, 'app');

  const params = new URLSearchParams({
    id: parsed.appId,
    hl: parsed.lang,
    gl: parsed.country,
  });
  const url = `${DETAILS_URL}?${params.toString()}`;

  const client = clientFromOptions(parsed);
  const html = await client.request({ url });
  const data = parseScriptData(html);
  const extracted = extract(data, appSpecs, 'app');

  return appSchema.parse({ ...extracted, appId: parsed.appId, url });
}
