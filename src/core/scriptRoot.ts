import { safeParse, type $ZodType } from 'zod/v4/core';
import { ParseError } from './errors.js';
import type { OnIntegrityEvent } from './integrity.js';
import { getPath, type Path } from './path.js';
import { parseRaw } from './raw.js';
import { resolveDsKeys, type ScriptData } from './scriptData.js';
import type { MissingPolicy } from './spec.js';

export interface ScriptRootSpec {
  rpcId?: string;
  paths: readonly Path[];
  schema: $ZodType;
  missing: MissingPolicy;
}

export type ResolvedScriptRoot = { root: unknown } | { root: undefined };

function pathLabel(path: Path): string {
  return path.join('.');
}

function missingRoot(spec: ScriptRootSpec, context: string): ResolvedScriptRoot {
  if (spec.missing.kind === 'required') {
    throw new ParseError(`${context}: required script root missing`);
  }
  if (spec.missing.kind === 'optional') {
    return { root: undefined };
  }
  const root = spec.missing.create();
  parseRaw(spec.schema, root, `${context} default root`);
  return { root };
}

export function resolveScriptRoot(
  data: ScriptData,
  spec: ScriptRootSpec,
  context: string,
  onIntegrityEvent?: OnIntegrityEvent,
): ResolvedScriptRoot {
  let invalidRoutedCandidate: { key: string; root: unknown } | undefined;
  if (spec.rpcId !== undefined) {
    const matches: { key: string; root: unknown }[] = [];
    for (const key of resolveDsKeys(data, spec.rpcId)) {
      const root = data.blocks[key];
      if (root !== undefined && root !== null && safeParse(spec.schema, root).success) {
        matches.push({ key, root });
      } else if (root !== undefined && root !== null && invalidRoutedCandidate === undefined) {
        invalidRoutedCandidate = { key, root };
      }
    }
    if (matches.length > 1) {
      const keys = matches.map((match) => match.key).join(', ');
      throw new ParseError(`${context}: rpc ${spec.rpcId} is ambiguous across ${keys}`);
    }
    const match = matches[0];
    if (match !== undefined) {
      return { root: match.root };
    }
  }

  for (const path of spec.paths) {
    const root = getPath(data.blocks, path);
    if (root === undefined || root === null) {
      continue;
    }
    parseRaw(spec.schema, root, `${context} fallback ${pathLabel(path)}`);
    if (spec.rpcId !== undefined) {
      const error = new ParseError(
        `${context}: used absolute fallback ${pathLabel(path)} for rpc ${spec.rpcId}`,
      );
      onIntegrityEvent?.({ context, reason: 'rpc-anchor-fallback', error });
    }
    return { root };
  }

  if (invalidRoutedCandidate !== undefined) {
    parseRaw(
      spec.schema,
      invalidRoutedCandidate.root,
      `${context} routed ${invalidRoutedCandidate.key}`,
    );
  }

  return missingRoot(spec, context);
}
