import { BASE_URL, permission } from '../../constants.js';
import { buildBatchBody } from '../../core/batchexecute.js';
import { getPath, type Path } from '../../core/path.js';
import type { AppPermission } from './schema.js';

export const PERMISSIONS_RPC_ID = 'xdSrCf';

const PERMISSIONS_STATIC_QUERY =
  'rpcids=qnKhOb&f.sid=-697906427155521722&bl=boq_playuiserver_20190903.08_p0';
const PERMISSIONS_TRAILING_QUERY =
  'authuser&soc-app=121&soc-platform=1&soc-device=1&_reqid=1065213';

export function permissionsUrl(lang: string, country: string): string {
  return `${BASE_URL}/_/PlayStoreUi/data/batchexecute?${PERMISSIONS_STATIC_QUERY}&hl=${lang}&gl=${country}&${PERMISSIONS_TRAILING_QUERY}`;
}

export function buildPermissionsBody(appId: string): string {
  return buildBatchBody(PERMISSIONS_RPC_ID, [[null, [appId, 7], []]], [null, '1']);
}

const PERMISSION_SECTIONS = [permission.COMMON, permission.OTHER] as const;
const GROUP_PERMISSIONS_PATH: Path = [2];
const PERMISSION_TEXT_PATH: Path = [1];

function sectionEntries(section: unknown, type: AppPermission['type']): AppPermission[] {
  if (!Array.isArray(section)) {
    return [];
  }
  const entries: AppPermission[] = [];
  for (const group of section) {
    const groupPermissions = getPath(group, GROUP_PERMISSIONS_PATH);
    if (!Array.isArray(groupPermissions)) {
      continue;
    }
    for (const groupPermission of groupPermissions) {
      const text = getPath(groupPermission, PERMISSION_TEXT_PATH);
      if (typeof text === 'string' && text.length > 0) {
        entries.push({ permission: text, type });
      }
    }
  }
  return entries;
}

export function mapPermissions(payload: unknown): AppPermission[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return PERMISSION_SECTIONS.flatMap((type) => sectionEntries(payload[type], type));
}
