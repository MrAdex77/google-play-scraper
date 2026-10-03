import { BASE_URL } from '../constants.ts';
import * as z from 'zod/mini';
import { ParseError } from './errors.ts';
import { parseRaw } from './raw.ts';

export const BATCH_URL = `${BASE_URL}/_/PlayStoreUi/data/batchexecute`;

const DEFAULT_ENVELOPE_TAIL: readonly unknown[] = [null, 'generic'];
const WRB_FRAME_MARKER = 'wrb.fr';
const SNIPPET_LENGTH = 200;
const STATUS_SLOT = 5;
const targetFrameSchema = z.tuple(
  [z.literal(WRB_FRAME_MARKER), z.string(), z.nullable(z.string())],
  z.unknown(),
);

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

export interface BatchEnvelope {
  payload: unknown;
  status: number | undefined;
}

function frameStatus(frame: readonly unknown[]): number | undefined {
  const status = frame[STATUS_SLOT];
  return isArray(status) && typeof status[0] === 'number' ? status[0] : undefined;
}

function matchEnvelope(frames: readonly unknown[], rpcId: string): BatchEnvelope | undefined {
  for (const frame of frames) {
    if (!isArray(frame)) {
      continue;
    }
    if (frame[0] === WRB_FRAME_MARKER && frame[1] === rpcId) {
      const raw = parseRaw(targetFrameSchema, frame, `batchexecute ${rpcId} envelope`)[2];
      const status = frameStatus(frame);
      if (raw === null) {
        return { payload: null, status };
      }
      try {
        return { payload: JSON.parse(raw), status };
      } catch {
        throw new ParseError(`batchexecute ${rpcId} payload is not valid JSON`);
      }
    }
  }
  return undefined;
}

function tryParseArray(text: string): readonly unknown[] | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function parseBatchEnvelope(text: string, rpcId: string): BatchEnvelope {
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
    const envelope = matchEnvelope(frames, rpcId);
    if (envelope !== undefined) {
      return envelope;
    }
  }

  const whole = tryParseArray(body);
  if (whole !== undefined) {
    const envelope = matchEnvelope(whole, rpcId);
    if (envelope !== undefined) {
      return envelope;
    }
  }

  throw new ParseError(`batchexecute response has no envelope for rpc ${rpcId}: ${snippet(body)}`);
}

export function parseBatchResponse(text: string, rpcId: string): unknown {
  return parseBatchEnvelope(text, rpcId).payload;
}
