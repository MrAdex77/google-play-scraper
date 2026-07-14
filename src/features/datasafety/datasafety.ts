import { z } from 'zod';
import { BASE_URL } from '../../constants.js';
import { clientFromOptions, type ResolveClient } from '../../core/http.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { parseScriptData } from '../../core/scriptData.js';
import { extract } from '../../core/spec.js';
import { dataSafetySchema, type DataSafety } from './schema.js';
import { dataSafetySpecs } from './specs.js';

const DATA_SAFETY_CONTEXT = 'datasafety';

export const dataSafetyOptionsSchema = baseOptionsSchema.extend({
  appId: z.string().min(1),
});

export type DataSafetyOptions = z.input<typeof dataSafetyOptionsSchema>;

const DATA_SAFETY_URL = `${BASE_URL}/store/apps/datasafety`;

export function createDatasafety(resolveClient: ResolveClient = clientFromOptions) {
  return async function datasafety(options: DataSafetyOptions): Promise<DataSafety> {
    const parsed = parseOptions(dataSafetyOptionsSchema, options, DATA_SAFETY_CONTEXT);

    const params = new URLSearchParams({ id: parsed.appId, hl: parsed.lang });
    const url = `${DATA_SAFETY_URL}?${params.toString()}`;

    const client = resolveClient(parsed);
    const html = await client.request({ url });
    const data = parseScriptData(html);
    const extracted = extract(data, dataSafetySpecs, DATA_SAFETY_CONTEXT);

    return dataSafetySchema.parse(extracted);
  };
}

export const datasafety = createDatasafety();
