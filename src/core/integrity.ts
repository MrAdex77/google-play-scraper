import { ParseError } from './errors.js';

export type IntegrityReason =
  'rpc-anchor-fallback' | 'optional-section-parse' | 'pagination-token-cycle';

export interface IntegrityEvent {
  context: string;
  reason: IntegrityReason;
  error: ParseError;
}

export type OnIntegrityEvent = (event: IntegrityEvent) => void;

export function detectPaginationTokenCycle(
  seenTokens: Set<string>,
  token: string,
  context: string,
  onIntegrityEvent?: OnIntegrityEvent,
): boolean {
  if (!seenTokens.has(token)) {
    seenTokens.add(token);
    return false;
  }
  const error = new ParseError(`${context}: pagination token cycle detected`);
  onIntegrityEvent?.({ context, reason: 'pagination-token-cycle', error });
  return true;
}

export function parseOptionalSection<T>(
  context: string,
  parseSection: () => T,
  onIntegrityEvent?: OnIntegrityEvent,
): T | undefined {
  try {
    return parseSection();
  } catch (error) {
    if (!(error instanceof ParseError)) {
      throw error;
    }
    onIntegrityEvent?.({ context, reason: 'optional-section-parse', error });
    return undefined;
  }
}
