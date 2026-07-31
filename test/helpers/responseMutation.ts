export type MutationPath = readonly (number | string)[];

interface ServiceTable {
  entries: string[];
  end: number;
  start: number;
}

function pathLabel(path: MutationPath): string {
  return path.join('.');
}

function containerAt(root: unknown, path: MutationPath): object {
  let current = root;
  for (const segment of path) {
    if (typeof current !== 'object' || current === null || !Reflect.has(current, segment)) {
      throw new Error(`mutation source path missing: ${pathLabel(path)}`);
    }
    current = Reflect.get(current, segment);
  }
  if (typeof current !== 'object' || current === null) {
    throw new Error(`mutation container path missing: ${pathLabel(path)}`);
  }
  return current;
}

function valueAt(root: unknown, path: MutationPath): unknown {
  const segment = path.at(-1);
  if (segment === undefined) {
    throw new Error('mutation path must not be empty');
  }
  const parent = containerAt(root, path.slice(0, -1));
  if (!Reflect.has(parent, segment)) {
    throw new Error(`mutation source path missing: ${pathLabel(path)}`);
  }
  return Reflect.get(parent, segment);
}

function serviceTable(html: string): ServiceTable {
  const marker = '; var AF_dataServiceRequests = {';
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new Error('service request table missing');
  }
  const bodyStart = start + marker.length;
  const suffix = '}; var AF_initDataChunkQueue';
  const end = html.indexOf(suffix, bodyStart);
  if (end < 0) {
    throw new Error('service request table terminator missing');
  }

  const entries: string[] = [];
  const body = html.slice(bodyStart, end);
  let entryStart = 0;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index] ?? '';
    if (quote.length > 0) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === '{' || character === '[' || character === '(') {
      depth += 1;
    } else if (character === '}' || character === ']' || character === ')') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      entries.push(body.slice(entryStart, index));
      entryStart = index + 1;
    }
  }
  entries.push(body.slice(entryStart));
  return { entries, start: bodyStart, end };
}

function serviceEntryKey(entry: string): string | undefined {
  return /^\s*'(ds:\d+)'\s*:/.exec(entry)?.[1];
}

function scriptBlock(html: string, key: string): { block: string; end: number; start: number } {
  for (const match of html.matchAll(/<script[^>]*>AF_initDataCallback[\s\S]*?<\/script>/g)) {
    const block = match[0];
    const start = match.index;
    if (block.includes(`key: '${key}'`)) {
      return { block, start, end: start + block.length };
    }
  }
  throw new Error(`script block missing: ${key}`);
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function deletePath<T>(value: T, path: MutationPath): T {
  const cloned = deepClone(value);
  const segment = path.at(-1);
  if (segment === undefined) {
    throw new Error('mutation path must not be empty');
  }
  const parent = containerAt(cloned, path.slice(0, -1));
  if (!Reflect.has(parent, segment)) {
    throw new Error(`mutation source path missing: ${pathLabel(path)}`);
  }
  if (!Reflect.deleteProperty(parent, segment)) {
    throw new Error(`mutation source path could not be deleted: ${pathLabel(path)}`);
  }
  if (Reflect.has(parent, segment)) {
    throw new Error(`mutation source path missing: ${pathLabel(path)}`);
  }
  return cloned;
}

export function movePath<T>(value: T, sourcePath: MutationPath, targetPath: MutationPath): T {
  const cloned = deepClone(value);
  const sourceValue = valueAt(cloned, sourcePath);
  const sourceSegment = sourcePath.at(-1);
  const targetSegment = targetPath.at(-1);
  if (sourceSegment === undefined || targetSegment === undefined) {
    throw new Error('mutation path must not be empty');
  }
  const sourceParent = containerAt(cloned, sourcePath.slice(0, -1));
  const targetParent = containerAt(cloned, targetPath.slice(0, -1));
  if (!Reflect.deleteProperty(sourceParent, sourceSegment)) {
    throw new Error(`mutation source path could not be deleted: ${pathLabel(sourcePath)}`);
  }
  if (!Reflect.set(targetParent, targetSegment, sourceValue)) {
    throw new Error(`mutation target path could not be set: ${pathLabel(targetPath)}`);
  }
  return cloned;
}

export function renameAfInitDataCallbackKey(html: string, from: string, to: string): string {
  const target = scriptBlock(html, from);
  const renamed = target.block.replace(`key: '${from}'`, `key: '${to}'`);
  return `${html.slice(0, target.start)}${renamed}${html.slice(target.end)}`;
}

export function replaceScriptBlockData(html: string, key: string, value: unknown): string {
  const target = scriptBlock(html, key);
  const payload = /data:[\s\S]*?, sideChannel: {}}\);<\/script>/.exec(target.block)?.[0];
  if (payload === undefined) {
    throw new Error(`script block payload missing: ${key}`);
  }
  const replacement = `data:${JSON.stringify(value)}, sideChannel: {}});</script>`;
  const replaced = target.block.replace(payload, replacement);
  return `${html.slice(0, target.start)}${replaced}${html.slice(target.end)}`;
}

export function corruptScriptBlockData(html: string, key: string): string {
  const target = scriptBlock(html, key);
  const payload = /data:[\s\S]*?, sideChannel: {}}\);<\/script>/.exec(target.block)?.[0];
  if (payload === undefined) {
    throw new Error(`script block payload missing: ${key}`);
  }
  const replaced = target.block.replace(
    payload,
    'data:not valid json, sideChannel: {}});</script>',
  );
  return `${html.slice(0, target.start)}${replaced}${html.slice(target.end)}`;
}

export function removeScriptBlock(html: string, key: string): string {
  const target = scriptBlock(html, key);
  return `${html.slice(0, target.start)}${html.slice(target.end)}`;
}

export function changeRoutingTableEntry(
  html: string,
  sourceKey: string,
  replacement: { key?: string; rpcId?: string },
): string {
  const table = serviceTable(html);
  const index = table.entries.findIndex((entry) => serviceEntryKey(entry) === sourceKey);
  const entry = table.entries[index];
  if (entry === undefined) {
    throw new Error(`service request entry missing: ${sourceKey}`);
  }
  let changed = entry;
  if (replacement.key !== undefined) {
    changed = changed.replace(`'${sourceKey}'`, `'${replacement.key}'`);
  }
  if (replacement.rpcId !== undefined) {
    if (!/id\s*:\s*'[^']+'/.test(changed)) {
      throw new Error(`service request rpc id missing: ${sourceKey}`);
    }
    changed = changed.replace(/id\s*:\s*'[^']+'/, `id:'${replacement.rpcId}'`);
  }
  table.entries[index] = changed;
  return `${html.slice(0, table.start)}${table.entries.join(',')}${html.slice(table.end)}`;
}

export function reorderRoutingTableEntries(html: string, orderedKeys: readonly string[]): string {
  const table = serviceTable(html);
  const selected = new Map<string, string>();
  const selectedIndexes: number[] = [];
  for (let index = 0; index < table.entries.length; index += 1) {
    const entry = table.entries[index];
    if (entry === undefined) {
      continue;
    }
    const key = serviceEntryKey(entry);
    if (key !== undefined && orderedKeys.includes(key)) {
      selected.set(key, entry);
      selectedIndexes.push(index);
    }
  }
  if (selected.size !== orderedKeys.length || new Set(orderedKeys).size !== orderedKeys.length) {
    throw new Error('routing reorder keys must exist exactly once');
  }
  for (let index = 0; index < selectedIndexes.length; index += 1) {
    const entryIndex = selectedIndexes[index];
    const key = orderedKeys[index];
    const entry = key === undefined ? undefined : selected.get(key);
    if (entryIndex === undefined || entry === undefined) {
      throw new Error('routing reorder entry missing');
    }
    table.entries[entryIndex] = entry;
  }
  return `${html.slice(0, table.start)}${table.entries.join(',')}${html.slice(table.end)}`;
}
