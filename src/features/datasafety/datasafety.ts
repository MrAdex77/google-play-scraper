import * as z from 'zod/mini';
import { BASE_URL } from '../../constants.js';
import { clientFromOptions, type ResolveClient } from '../../core/http.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { parseScriptData } from '../../core/scriptData.js';
import { resolveScriptRoot } from '../../core/scriptRoot.js';
import { extract } from '../../core/spec.js';
import { dataSafetySchema, type DataSafety } from './schema.js';
import { dataSafetyRootSpec, dataSafetyScriptDataSelection, dataSafetySpecs } from './specs.js';

const DATA_SAFETY_CONTEXT = 'dataSafety';

export const dataSafetyOptionsSchema = z.extend(baseOptionsSchema, {
  appId: z.string().check(z.minLength(1)),
});

export type DataSafetyOptions = z.input<typeof dataSafetyOptionsSchema>;

const DATA_SAFETY_URL = `${BASE_URL}/store/apps/datasafety`;
const MISSING_APP_MARKER = '<title>Not Found</title>';

function emptyDataSafetyReport(): DataSafety {
  return dataSafetySchema.parse({
    sharedData: [],
    collectedData: [],
    securityPractices: [],
    privacyPolicyUrl: undefined,
  });
}

export function createDataSafety(resolveClient: ResolveClient = clientFromOptions) {
  return async function dataSafety(options: DataSafetyOptions): Promise<DataSafety> {
    const parsed = parseOptions(dataSafetyOptionsSchema, options, DATA_SAFETY_CONTEXT);

    const params = new URLSearchParams({ id: parsed.appId, hl: parsed.lang });
    const url = `${DATA_SAFETY_URL}?${params.toString()}`;

    const client = resolveClient(parsed);
    const html = await client.request({ url });
    if (html.includes(MISSING_APP_MARKER)) {
      return emptyDataSafetyReport();
    }
    const data = parseScriptData(html, dataSafetyScriptDataSelection);
    const root = resolveScriptRoot(
      data,
      dataSafetyRootSpec,
      `${DATA_SAFETY_CONTEXT} root`,
      parsed.onIntegrityEvent,
    );
    const extracted = extract(root.root, dataSafetySpecs, DATA_SAFETY_CONTEXT);

    return dataSafetySchema.parse(extracted);
  };
}

export const dataSafety = createDataSafety();
