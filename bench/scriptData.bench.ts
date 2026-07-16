import { bench, describe } from 'vitest';
import { parseScriptData, resolveDsKey } from '../src/core/scriptData.js';
import type { ScriptData } from '../src/core/scriptData.js';
import type { SpecMap } from '../src/core/spec.js';
import { appSpecs } from '../src/features/app/specs.js';
import { APP_FIXTURES, loadAppFixture } from './fixtures.js';
import type { AppFixtureName } from './fixtures.js';

const SCRIPT_BLOCK_REGEX = />AF_initDataCallback[\s\S]*?<\/script/g;
const BLOCK_KEY_REGEX = /(ds:.*?)'/;
const BLOCK_PAYLOAD_REGEX = /data:([\s\S]*?), sideChannel: {}}\);<\//;

const specs: SpecMap = appSpecs;

function referencedDsKeys(data: ScriptData): Set<string> {
  const keys = new Set<string>();
  for (const spec of Object.values(specs)) {
    for (const path of spec.paths) {
      const head = path[0];
      if (typeof head === 'string' && head.startsWith('ds:')) {
        keys.add(head);
      }
    }
    if (spec.serviceRequestId !== undefined) {
      const resolved = resolveDsKey(data, spec.serviceRequestId);
      if (resolved !== undefined) {
        keys.add(resolved);
      }
    }
  }
  return keys;
}

function parseBlocksOnly(html: string): Record<string, unknown> {
  const blocks: Record<string, unknown> = {};
  const matches = html.match(SCRIPT_BLOCK_REGEX);
  if (matches === null) {
    return blocks;
  }
  for (const block of matches) {
    const key = BLOCK_KEY_REGEX.exec(block)?.[1];
    const payload = BLOCK_PAYLOAD_REGEX.exec(block)?.[1];
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

function parseReferencedBlocks(
  html: string,
  referenced: ReadonlySet<string>,
): Record<string, unknown> {
  const blocks: Record<string, unknown> = {};
  const matches = html.match(SCRIPT_BLOCK_REGEX);
  if (matches === null) {
    return blocks;
  }
  for (const block of matches) {
    const key = BLOCK_KEY_REGEX.exec(block)?.[1];
    if (key === undefined || !referenced.has(key)) {
      continue;
    }
    const payload = BLOCK_PAYLOAD_REGEX.exec(block)?.[1];
    if (payload === undefined) {
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

const sink = { total: 0 };

for (const name of Object.keys(APP_FIXTURES) as AppFixtureName[]) {
  const html = loadAppFixture(name);
  const referenced = referencedDsKeys(parseScriptData(html));

  describe(name, () => {
    bench(
      'parseScriptData',
      () => {
        sink.total += Object.keys(parseScriptData(html).blocks).length;
      },
      { time: 1000 },
    );

    bench(
      'parse blocks only',
      () => {
        sink.total += Object.keys(parseBlocksOnly(html)).length;
      },
      { time: 1000 },
    );

    bench(
      'parse referenced blocks only',
      () => {
        sink.total += Object.keys(parseReferencedBlocks(html, referenced)).length;
      },
      { time: 1000 },
    );
  });
}
