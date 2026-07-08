import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  GooglePlayError,
  HttpError,
  NotFoundError,
  ParseError,
  RateLimitError,
  SpecError,
  ValidationError,
} from './errors.js';
import type { SpecFailure } from './errors.js';

describe('error taxonomy', () => {
  it('roots every error at GooglePlayError with its own name', () => {
    const base = new GooglePlayError('boom');
    expect(base).toBeInstanceOf(Error);
    expect(base.name).toBe('GooglePlayError');
    expect(base.message).toBe('boom');
  });

  it('carries status and url on HttpError and its subclasses', () => {
    const http = new HttpError('failed', 500, 'https://x');
    expect(http.name).toBe('HttpError');
    expect(http.status).toBe(500);
    expect(http.url).toBe('https://x');

    const notFound = new NotFoundError('App not found (404)', 404, 'https://x');
    expect(notFound).toBeInstanceOf(HttpError);
    expect(notFound.name).toBe('NotFoundError');

    const rateLimit = new RateLimitError('slow down', 429, 'https://x');
    expect(rateLimit).toBeInstanceOf(HttpError);
    expect(rateLimit.name).toBe('RateLimitError');
  });

  it('flattens zod issues into a readable ValidationError message', () => {
    const schema = z.object({ country: z.string().length(2) });
    const result = schema.safeParse({ country: 'u' });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    const error = ValidationError.fromZod(result.error, 'listApps');
    expect(error).toBeInstanceOf(GooglePlayError);
    expect(error.name).toBe('ValidationError');
    expect(error.message).toContain('listApps');
    expect(error.message).toContain('country');
  });

  it('uses the bare issue message when a zod issue has no path', () => {
    const result = z.string().safeParse(42);
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    const error = ValidationError.fromZod(result.error, 'suggest');
    const issueMessage = result.error.issues[0]?.message ?? '';
    expect(error.message).toBe(`suggest: ${issueMessage}`);
  });

  it('names every failed field in a SpecError message', () => {
    const failures: SpecFailure[] = [
      { field: 'title', paths: [[0, 0, 1]], message: 'expected string' },
      {
        field: 'ratings',
        paths: [
          [51, 0],
          [51, 2],
        ],
        message: 'expected number',
      },
    ];
    const error = new SpecError('detailApp', failures);

    expect(error).toBeInstanceOf(ParseError);
    expect(error).toBeInstanceOf(GooglePlayError);
    expect(error.name).toBe('SpecError');
    expect(error.context).toBe('detailApp');
    expect(error.failures).toBe(failures);
    expect(error.message).toContain('detailApp');
    expect(error.message).toContain('title');
    expect(error.message).toContain('expected string');
    expect(error.message).toContain('ratings');
    expect(error.message).toContain('expected number');
  });

  it('marks ParseError with its own name', () => {
    const error = new ParseError('cannot parse');
    expect(error).toBeInstanceOf(GooglePlayError);
    expect(error.name).toBe('ParseError');
  });
});
