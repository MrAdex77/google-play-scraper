import { BASE_URL } from '../constants.js';
import { ParseError } from './errors.js';

export const BATCH_URL = `${BASE_URL}/_/PlayStoreUi/data/batchexecute`;

const DEFAULT_ENVELOPE_TAIL: readonly unknown[] = [null, 'generic'];
const WRB_FRAME_MARKER = 'wrb.fr';
const SNIPPET_LENGTH = 200;

function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function snippet(text: string): string {
  return text.slice(0, SNIPPET_LENGTH);
}

export function buildBatchBody(
  rpcId: string,
  payload: unknown,
  envelopeTail: readonly unknown[] = DEFAULT_ENVELOPE_TAIL,
): string {
  const inner: unknown[] = [rpcId, JSON.stringify(payload), ...envelopeTail];
  const envelope = [[inner]];
  return new URLSearchParams({ 'f.req': JSON.stringify(envelope) }).toString();
}

interface EnvelopeMatch {
  found: boolean;
  value: unknown;
}

function matchEnvelope(frames: readonly unknown[], rpcId: string): EnvelopeMatch {
  for (const frame of frames) {
    if (!isArray(frame)) {
      continue;
    }
    if (frame[0] === WRB_FRAME_MARKER && frame[1] === rpcId) {
      const raw = frame[2];
      if (typeof raw === 'string') {
        return { found: true, value: JSON.parse(raw) };
      }
      return { found: true, value: null };
    }
  }
  return { found: false, value: undefined };
}

function tryParseArray(text: string): readonly unknown[] | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function parseBatchResponse(text: string, rpcId: string): unknown {
  const start = text.indexOf('[');
  if (start === -1) {
    throw new ParseError(`batchexecute response missing array start: ${snippet(text)}`);
  }
  const body = text.slice(start);

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('[')) {
      continue;
    }
    const frames = tryParseArray(trimmed);
    if (frames === undefined) {
      continue;
    }
    const match = matchEnvelope(frames, rpcId);
    if (match.found) {
      return match.value;
    }
  }

  const whole = tryParseArray(body);
  if (whole !== undefined) {
    const match = matchEnvelope(whole, rpcId);
    if (match.found) {
      return match.value;
    }
  }

  throw new ParseError(`batchexecute response has no envelope for rpc ${rpcId}: ${snippet(body)}`);
}
