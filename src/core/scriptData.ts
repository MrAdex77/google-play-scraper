import { ParseError } from './errors.js';
import type { FieldSpec } from './spec.js';
import type { ScriptRootSpec } from './scriptRoot.js';

export interface ScriptData {
  blocks: Record<string, unknown>;
  serviceRequests: Record<string, string>;
}

export interface ScriptDataSelection {
  blockKeys: ReadonlySet<string>;
  rpcIds: ReadonlySet<string>;
}

type ScriptDataRequirement = FieldSpec | ScriptRootSpec;

const SCRIPT_BLOCK_REGEX = />AF_initDataCallback[\s\S]*?<\/script/g;
const BLOCK_KEY_REGEX = /(ds:.*?)'/;
const BLOCK_PAYLOAD_REGEX = /data:([\s\S]*?), sideChannel: {}}\);<\//;
const SERVICE_TABLE_REGEX = /; var AF_dataServiceRequests[\s\S]*?; var AF_initDataChunkQueue/;
const SERVICE_PAIR_REGEX = /'(ds:\d+)'\s*:\s*\{\s*id:\s*'([^']+)'/g;

function isBlockKey(value: unknown): value is string {
  return typeof value === 'string' && /^ds:\d+$/.test(value);
}

export function deriveScriptDataSelection(
  requirements: readonly ScriptDataRequirement[],
): ScriptDataSelection {
  const blockKeys = new Set<string>();
  const rpcIds = new Set<string>();
  for (const requirement of requirements) {
    let contributed = false;
    if ('rpcId' in requirement && requirement.rpcId !== undefined) {
      rpcIds.add(requirement.rpcId);
      contributed = true;
    }
    for (const path of requirement.paths) {
      const blockKey = path[0];
      if (isBlockKey(blockKey)) {
        blockKeys.add(blockKey);
        contributed = true;
      }
    }
    if (!contributed) {
      throw new Error('script data requirement has no statically resolvable key');
    }
  }
  return { blockKeys, rpcIds };
}

function selectedBlockKeys(
  selection: ScriptDataSelection | undefined,
  serviceRequests: Record<string, string>,
): ReadonlySet<string> | undefined {
  if (selection === undefined) {
    return undefined;
  }
  const keys = new Set(selection.blockKeys);
  for (const [key, rpcId] of Object.entries(serviceRequests)) {
    if (selection.rpcIds.has(rpcId)) {
      keys.add(key);
    }
  }
  return keys;
}

function parseBlocks(html: string, selectedKeys?: ReadonlySet<string>): Record<string, unknown> {
  const blocks: Record<string, unknown> = {};
  const parsedKeys = new Set<string>();
  const matches = html.match(SCRIPT_BLOCK_REGEX);
  if (matches === null) {
    return blocks;
  }
  for (const block of matches) {
    const keyMatch = BLOCK_KEY_REGEX.exec(block);
    const payloadMatch = BLOCK_PAYLOAD_REGEX.exec(block);
    const key = keyMatch?.[1];
    const payload = payloadMatch?.[1];
    if (key === undefined || payload === undefined) {
      continue;
    }
    if (selectedKeys !== undefined && !selectedKeys.has(key)) {
      continue;
    }
    if (selectedKeys !== undefined && parsedKeys.has(key)) {
      throw new ParseError(`script data block ${key}: duplicate selected callback`);
    }
    try {
      blocks[key] = JSON.parse(payload);
      parsedKeys.add(key);
    } catch {
      if (selectedKeys !== undefined) {
        throw new ParseError(`script data block ${key}: invalid JSON`);
      }
      continue;
    }
  }
  return blocks;
}

function parseServiceRequests(html: string): Record<string, string> {
  const requests: Record<string, string> = {};
  const tableMatch = SERVICE_TABLE_REGEX.exec(html);
  const table = tableMatch?.[0];
  if (table === undefined) {
    return requests;
  }
  for (const pair of table.matchAll(SERVICE_PAIR_REGEX)) {
    const dsKey = pair[1];
    const rpcId = pair[2];
    if (dsKey !== undefined && rpcId !== undefined) {
      requests[dsKey] = rpcId;
    }
  }
  return requests;
}

export function parseScriptData(html: string, selection?: ScriptDataSelection): ScriptData {
  const serviceRequests = parseServiceRequests(html);
  return {
    blocks: parseBlocks(html, selectedBlockKeys(selection, serviceRequests)),
    serviceRequests,
  };
}

export function resolveDsKeys(data: ScriptData, rpcId: string): readonly string[] {
  const keys: string[] = [];
  for (const [dsKey, id] of Object.entries(data.serviceRequests)) {
    if (id === rpcId) {
      keys.push(dsKey);
    }
  }
  return keys;
}
