import type { ParseError } from './errors.js';

export interface IntegrityEvent {
  context: string;
  reason: 'rpc-anchor-fallback' | 'optional-section-parse' | 'pagination-token-cycle';
  error: ParseError;
}

export type OnIntegrityEvent = (event: IntegrityEvent) => void;
