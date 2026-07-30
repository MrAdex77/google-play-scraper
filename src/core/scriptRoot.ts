import { safeParse, type $ZodType } from 'zod/v4/core';
import { ParseError } from './errors.js';
import type { OnIntegrityEvent } from './integrity.js';
import { getPath, type Path } from './path.js';
import { parseRaw } from './raw.js';
import { resolveDsKeys, type ScriptData } from './scriptData.js';
import type { MissingPolicy } from './spec.js';

export type UnparsableCandidatePolicy = 'reject' | 'skip';

export interface ScriptRootSpec {
  rpcId?: string;
  paths: readonly Path[];
  schema: $ZodType;
  missing: MissingPolicy;
  unparsableCandidates?: UnparsableCandidatePolicy;
}

export interface ResolvedScriptRoot {
  root: unknown;
}

interface RootCandidate {
  kind: 'routed' | 'fallback';
  name: string;
  root: unknown;
}

function candidateLabel(candidate: RootCandidate): string {
  return `${candidate.kind} ${candidate.name}`;
}

function routedCandidates(data: ScriptData, rpcId: string | undefined): RootCandidate[] {
  if (rpcId === undefined) {
    return [];
  }
  const candidates: RootCandidate[] = [];
  for (const name of resolveDsKeys(data, rpcId)) {
    const root = data.blocks[name];
    if (root !== undefined && root !== null) {
      candidates.push({ kind: 'routed', name, root });
    }
  }
  return candidates;
}

function fallbackCandidates(data: ScriptData, paths: readonly Path[]): RootCandidate[] {
  const candidates: RootCandidate[] = [];
  for (const path of paths) {
    const root = getPath(data.blocks, path);
    if (root !== undefined && root !== null) {
      candidates.push({ kind: 'fallback', name: path.join('.'), root });
    }
  }
  return candidates;
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

function rejectCandidate(spec: ScriptRootSpec, context: string, candidate: RootCandidate): never {
  const label = candidateLabel(candidate);
  parseRaw(spec.schema, candidate.root, `${context} ${label}`);
  throw new ParseError(`${context}: ${label} does not match the expected root`);
}

function unmatchedRoot(
  spec: ScriptRootSpec,
  context: string,
  rejected: RootCandidate | undefined,
  onIntegrityEvent?: OnIntegrityEvent,
): ResolvedScriptRoot {
  if (rejected === undefined) {
    return missingRoot(spec, context);
  }
  if (spec.unparsableCandidates !== 'skip') {
    return rejectCandidate(spec, context, rejected);
  }
  const error = new ParseError(`${context}: skipped unparsable ${candidateLabel(rejected)}`);
  onIntegrityEvent?.({ context, reason: 'optional-section-parse', error });
  return missingRoot(spec, context);
}

export function resolveScriptRoot(
  data: ScriptData,
  spec: ScriptRootSpec,
  context: string,
  onIntegrityEvent?: OnIntegrityEvent,
): ResolvedScriptRoot {
  const matchesSchema = (candidate: RootCandidate): boolean =>
    safeParse(spec.schema, candidate.root).success;

  const routed = routedCandidates(data, spec.rpcId);
  const routedMatches = routed.filter(matchesSchema);
  if (spec.rpcId !== undefined && routedMatches.length > 1) {
    const names = routedMatches.map((candidate) => candidate.name).join(', ');
    throw new ParseError(`${context}: rpc ${spec.rpcId} is ambiguous across ${names}`);
  }
  const routedMatch = routedMatches[0];
  if (routedMatch !== undefined) {
    return { root: routedMatch.root };
  }

  const fallbacks = fallbackCandidates(data, spec.paths);
  const fallbackMatch = fallbacks.find(matchesSchema);
  if (fallbackMatch !== undefined) {
    if (spec.rpcId !== undefined) {
      const error = new ParseError(
        `${context}: used absolute ${candidateLabel(fallbackMatch)} for rpc ${spec.rpcId}`,
      );
      onIntegrityEvent?.({ context, reason: 'rpc-anchor-fallback', error });
    }
    return { root: fallbackMatch.root };
  }

  return unmatchedRoot(spec, context, fallbacks[0] ?? routed[0], onIntegrityEvent);
}
