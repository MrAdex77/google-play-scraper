import { z } from 'zod';
import { permission } from '../../constants.js';
import { parseBatchResponse } from '../../core/batchexecute.js';
import { clientFromOptions } from '../../core/http.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { permissionSchema, type AppPermission } from './schema.js';
import {
  buildPermissionsBody,
  mapPermissions,
  PERMISSIONS_RPC_ID,
  permissionsUrl,
} from './specs.js';

const PERMISSIONS_CONTEXT = 'permissions';

export const permissionsOptionsSchema = baseOptionsSchema.extend({
  appId: z.string().min(1),
  short: z.boolean().default(false),
});

export type PermissionsOptions = z.input<typeof permissionsOptionsSchema>;

const permissionsResultSchema = z.array(permissionSchema);

export async function permissions(
  options: PermissionsOptions,
): Promise<AppPermission[] | string[]> {
  const parsed = parseOptions(permissionsOptionsSchema, options, PERMISSIONS_CONTEXT);
  const client = clientFromOptions(parsed);

  const text = await client.request({
    url: permissionsUrl(parsed.lang, parsed.country),
    method: 'POST',
    body: buildPermissionsBody(parsed.appId),
  });

  const payload = parseBatchResponse(text, PERMISSIONS_RPC_ID);
  const entries = permissionsResultSchema.parse(mapPermissions(payload));

  if (!parsed.short) {
    return entries;
  }
  return entries
    .filter((entry) => entry.type === permission.COMMON)
    .map((entry) => entry.permission);
}
