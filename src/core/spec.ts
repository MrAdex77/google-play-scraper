import { $ZodError, parse, type $ZodType } from 'zod/v4/core';
import type * as z from 'zod/mini';
import type { Path } from './path.js';
import { getPath } from './path.js';
import type { ScriptData } from './scriptData.js';
import { resolveDsKey } from './scriptData.js';
import type { SpecFailure } from './errors.js';
import { SpecError } from './errors.js';

export interface FieldSpec<T = unknown> {
  paths: readonly Path[];
  schema: $ZodType<T>;
  serviceRequestId?: string;
  transform?: (value: unknown, source: unknown) => unknown;
}

export type SpecMap = Record<string, FieldSpec>;
export type Extracted<M extends SpecMap> = { [K in keyof M]: z.infer<M[K]['schema']> };

function isScriptData(source: unknown): source is ScriptData {
  return (
    typeof source === 'object' &&
    source !== null &&
    'blocks' in source &&
    'serviceRequests' in source
  );
}

function candidatePaths(spec: FieldSpec, source: unknown): readonly Path[] {
  if (spec.serviceRequestId !== undefined && isScriptData(source)) {
    const dsKey = resolveDsKey(source, spec.serviceRequestId);
    if (dsKey !== undefined) {
      return spec.paths.map((path) => [dsKey, ...path]);
    }
  }
  return spec.paths;
}

function resolveValue(root: unknown, paths: readonly Path[]): unknown {
  for (const path of paths) {
    const value = getPath(root, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function failureMessage(error: unknown): string {
  if (error instanceof $ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'non-error thrown during extraction';
}

export function extract<M extends SpecMap>(
  source: unknown,
  specs: M,
  context: string,
): Extracted<M>;
export function extract(source: unknown, specs: SpecMap, context: string): Record<string, unknown> {
  const root = isScriptData(source) ? source.blocks : source;
  const result: Record<string, unknown> = {};
  const failures: SpecFailure[] = [];

  for (const [field, spec] of Object.entries(specs)) {
    const paths = candidatePaths(spec, source);
    const raw = resolveValue(root, paths);
    try {
      const input = spec.transform ? spec.transform(raw, source) : raw;
      result[field] = parse(spec.schema, input);
    } catch (error) {
      failures.push({ field, paths, message: failureMessage(error) });
    }
  }

  if (failures.length > 0) {
    throw new SpecError(context, failures);
  }

  return result;
}
