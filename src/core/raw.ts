import { $ZodError, parse, type $ZodType, type output } from 'zod/v4/core';
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
