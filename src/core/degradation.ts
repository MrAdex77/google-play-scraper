import type { ParseError } from './errors.ts';

export interface DegradationEvent {
  context: string;
  reason: 'cluster-page-parse';
  error: ParseError;
}

export type OnDegradation = (event: DegradationEvent) => void;
