import { $ZodError, parse, type $ZodType, type output } from 'zod/v4/core';
import * as z from 'zod/mini';
import { ParseError } from './errors.js';

function formatIssues(error: $ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

export function parseRaw<Schema extends $ZodType>(
  schema: Schema,
  value: unknown,
  context: string,
): output<Schema> {
  try {
    return parse(schema, value);
  } catch (error) {
    if (error instanceof $ZodError) {
      throw new ParseError(`${context}: ${formatIssues(error)}`);
    }
    throw error;
  }
}

function buildRawArrayPathSchema(
  path: readonly number[],
  valueSchema: z.ZodMiniType,
  optionalSegments: boolean,
): z.ZodMiniType {
  let schema = valueSchema;
  for (const index of path.toReversed()) {
    const nested = optionalSegments ? z.optional(schema) : schema;
    const items: [z.ZodMiniType, ...z.ZodMiniType[]] = [nested];
    for (let offset = 0; offset < index; offset += 1) {
      items.unshift(z.unknown());
    }
    schema = z.tuple(items, z.unknown());
  }
  return schema;
}

export function rawArrayPathSchema(
  path: readonly number[],
  valueSchema: z.ZodMiniType,
): z.ZodMiniType {
  return buildRawArrayPathSchema(path, valueSchema, false);
}

export function rawOptionalArrayPathSchema(
  path: readonly number[],
  valueSchema: z.ZodMiniType,
): z.ZodMiniType {
  return buildRawArrayPathSchema(path, valueSchema, true);
}
