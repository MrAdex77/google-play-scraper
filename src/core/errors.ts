import type { $ZodError } from 'zod/v4/core';

export class GooglePlayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GooglePlayError';
  }
}

export class ValidationError extends GooglePlayError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }

  static fromZod(error: $ZodError, context: string): ValidationError {
    const details = error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');
    return new ValidationError(`${context}: ${details}`);
  }
}

export class HttpError extends GooglePlayError {
  readonly status: number;
  readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string, status: number, url: string) {
    super(message, status, url);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends HttpError {
  constructor(message: string, status: number, url: string) {
    super(message, status, url);
    this.name = 'RateLimitError';
  }
}

export class BlockedError extends GooglePlayError {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedError';
  }
}

export class ParseError extends GooglePlayError {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export interface SpecFailure {
  field: string;
  paths: readonly (readonly (string | number)[])[];
  message: string;
}

export class SpecError extends ParseError {
  readonly context: string;
  readonly failures: SpecFailure[];

  constructor(context: string, failures: SpecFailure[]) {
    super(SpecError.buildMessage(context, failures));
    this.name = 'SpecError';
    this.context = context;
    this.failures = failures;
  }

  private static buildMessage(context: string, failures: SpecFailure[]): string {
    const lines = failures.map((failure) => {
      const paths = failure.paths.map((path) => `[${path.join(', ')}]`).join(' | ');
      return `  ${failure.field} (${paths}): ${failure.message}`;
    });
    return [`${context} failed to parse ${failures.length.toString()} field(s):`, ...lines].join(
      '\n',
    );
  }
}
