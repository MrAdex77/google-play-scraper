import * as z from 'zod/mini';
import { getPath, isRecord, type Path } from '../../core/path.js';
import type { ScriptRootSpec } from '../../core/scriptRoot.js';
import { deriveScriptDataSelection } from '../../core/scriptData.js';
import { defaulted, optional, required, type SpecMap } from '../../core/spec.js';
import { dataEntrySchema, securityPracticeSchema } from './schema.js';

export const DATA_SAFETY_RPC_ID = 'Ws7gDc';

const SHARED_DATA_PATH: Path = [1, 2, 1, '138', 4, 0, 0];
const COLLECTED_DATA_PATH: Path = [1, 2, 1, '138', 4, 1, 0];
const SECURITY_PRACTICES_PATH: Path = [1, 2, 1, '138', 9, 2];
const PRIVACY_POLICY_PATH: Path = [1, 2, 1, '100', 0, 5, 2];

const ENTRY_TYPE_PATH: Path = [0, 1];
const ENTRY_DETAILS_PATH: Path = [4];
const DETAIL_DATA_PATH: Path = [0];
const DETAIL_OPTIONAL_PATH: Path = [1];
const DETAIL_PURPOSE_PATH: Path = [2];
const PRACTICE_LABEL_PATH: Path = [1];
const PRACTICE_DESCRIPTION_PATH: Path = [2, 1];

function isOptionalArray(value: unknown): boolean {
  return value === undefined || value === null || Array.isArray(value);
}

function isDataSafetyReportRoot(value: unknown): boolean {
  const node = getPath(value, [1, 2, 1]);
  if (!isRecord(node) || (!('138' in node) && !('100' in node))) {
    return false;
  }
  return (
    isOptionalArray(getPath(value, SHARED_DATA_PATH)) &&
    isOptionalArray(getPath(value, COLLECTED_DATA_PATH)) &&
    isOptionalArray(getPath(value, SECURITY_PRACTICES_PATH))
  );
}

export const dataSafetyRootSchema = z.union([
  z.tuple([]),
  z.custom<unknown[]>(isDataSafetyReportRoot),
]);

export const dataSafetyRootSpec = {
  rpcId: DATA_SAFETY_RPC_ID,
  paths: [['ds:3']],
  schema: dataSafetyRootSchema,
  missing: required(),
} satisfies ScriptRootSpec;

export const dataSafetyScriptDataSelection = deriveScriptDataSelection([dataSafetyRootSpec]);

function mapDataEntries(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const type = getPath(entry, ENTRY_TYPE_PATH);
    const details = getPath(entry, ENTRY_DETAILS_PATH);
    if (!Array.isArray(details)) {
      return [];
    }
    return details.map((detail) => ({
      data: getPath(detail, DETAIL_DATA_PATH),
      optional: Boolean(getPath(detail, DETAIL_OPTIONAL_PATH)),
      purpose: getPath(detail, DETAIL_PURPOSE_PATH),
      type,
    }));
  });
}

function mapSecurityPractices(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((practice) => ({
    practice: getPath(practice, PRACTICE_LABEL_PATH),
    description: getPath(practice, PRACTICE_DESCRIPTION_PATH),
  }));
}

export const dataSafetySpecs = {
  sharedData: {
    paths: [SHARED_DATA_PATH],
    missing: defaulted(() => []),
    schema: z._default(z.array(dataEntrySchema), []),
    transform: mapDataEntries,
  },
  collectedData: {
    paths: [COLLECTED_DATA_PATH],
    missing: defaulted(() => []),
    schema: z._default(z.array(dataEntrySchema), []),
    transform: mapDataEntries,
  },
  securityPractices: {
    paths: [SECURITY_PRACTICES_PATH],
    missing: defaulted(() => []),
    schema: z._default(z.array(securityPracticeSchema), []),
    transform: mapSecurityPractices,
  },
  privacyPolicyUrl: {
    paths: [PRIVACY_POLICY_PATH],
    missing: optional(),
    schema: z.optional(z.url()),
  },
} satisfies SpecMap;
