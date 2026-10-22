import { permission } from '../../constants.ts';
import { buildBatchBody } from '../../core/batchexecute.ts';
import { getPath, type Path } from '../../core/path.ts';
import { rawOptionalArrayPathSchema } from '../../core/raw.ts';
import type { AppPermission } from './schema.ts';
import * as z from 'zod/mini';

export const PERMISSIONS_RPC_ID = 'xdSrCf';

export function buildPermissionsBody(appId: string): string {
  return buildBatchBody(PERMISSIONS_RPC_ID, [[null, [appId, 7], []]], [null, '1']);
}

const PERMISSION_SECTIONS = [permission.COMMON, permission.OTHER] as const;
const permissionSectionSchema = z.nullable(z.array(z.unknown()));
export const commonPermissionsResponseSchema = z.union([
  z.literal(null),
  rawOptionalArrayPathSchema([permission.COMMON], permissionSectionSchema),
]);
export const otherPermissionsResponseSchema = z.union([
  z.literal(null),
  rawOptionalArrayPathSchema([permission.OTHER], permissionSectionSchema),
]);
const GROUP_NAME_PATH: Path = [0];
const GROUP_PERMISSIONS_PATH: Path = [2];
const PERMISSION_TEXT_PATH: Path = [1];

function groupName(group: unknown): string {
  const name = getPath(group, GROUP_NAME_PATH);
  return typeof name === 'string' ? name : '';
}

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
    const name = groupName(group);
    for (const groupPermission of groupPermissions) {
      const text = getPath(groupPermission, PERMISSION_TEXT_PATH);
      if (typeof text === 'string' && text.length > 0) {
        entries.push({ permission: text, type, group: name });
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
