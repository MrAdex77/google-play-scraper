import { ParseError } from './errors.js';

export type IntegrityReason =
  'rpc-anchor-fallback' | 'optional-section-parse' | 'pagination-token-cycle';

export interface IntegrityEvent {
  context: string;
  reason: IntegrityReason;
  error: ParseError;
}

export type OnIntegrityEvent = (event: IntegrityEvent) => void;

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
