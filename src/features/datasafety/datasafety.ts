import * as z from 'zod/mini';
import { clientFromOptions, type ResolveClient } from '../../core/http.ts';
import { appIdSchema, baseOptionsSchema, parseOptions } from '../../core/options.ts';
import { parseScriptData } from '../../core/scriptData.ts';
import { resolveScriptRoot } from '../../core/scriptRoot.ts';
import { extract } from '../../core/spec.ts';
import { dataSafetySchema, type DataSafety } from './schema.ts';
import {
  dataSafetyRootSpec,
  dataSafetyScriptDataSelection,
  dataSafetySpecs,
  dataSafetyUrl,
} from './specs.ts';

const DATA_SAFETY_CONTEXT = 'dataSafety';

export const dataSafetyOptionsSchema = z.extend(baseOptionsSchema, {
  appId: appIdSchema,
});

export type DataSafetyOptions = z.input<typeof dataSafetyOptionsSchema>;

const MISSING_APP_MARKER = 'id="error-section"';

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

    const client = resolveClient(parsed);
    const html = await client.request({
      url: dataSafetyUrl(parsed.appId, parsed.lang, parsed.country),
    });
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
