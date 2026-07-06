export interface ScriptData {
  blocks: Record<string, unknown>;
  serviceRequests: Record<string, string>;
}

const SCRIPT_BLOCK_REGEX = />AF_initDataCallback[\s\S]*?<\/script/g;
const BLOCK_KEY_REGEX = /(ds:.*?)'/;
const BLOCK_PAYLOAD_REGEX = /data:([\s\S]*?), sideChannel: {}}\);<\//;
const SERVICE_TABLE_REGEX = /; var AF_dataServiceRequests[\s\S]*?; var AF_initDataChunkQueue/;
const SERVICE_PAIR_REGEX = /'(ds:\d+)'\s*:\s*\{\s*id:\s*'([^']+)'/g;

function parseBlocks(html: string): Record<string, unknown> {
  const blocks: Record<string, unknown> = {};
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
    try {
      blocks[key] = JSON.parse(payload);
    } catch {
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

export function parseScriptData(html: string): ScriptData {
  return {
    blocks: parseBlocks(html),
    serviceRequests: parseServiceRequests(html),
  };
}

export function resolveDsKey(data: ScriptData, rpcId: string): string | undefined {
  for (const [dsKey, id] of Object.entries(data.serviceRequests)) {
    if (id === rpcId) {
      return dsKey;
    }
  }
  return undefined;
}
