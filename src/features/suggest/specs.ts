import { BATCH_URL } from '../../core/batchexecute.js';
import type { Path } from '../../core/path.js';

export const SUGGEST_RPC_ID = 'IJ4APc';

const STATIC_QUERY_PARAMS = {
  rpcids: SUGGEST_RPC_ID,
  'f.sid': '-697906427155521722',
  bl: 'boq_playuiserver_20190903.08_p0',
  'soc-app': '121',
  'soc-platform': '1',
  'soc-device': '1',
  _reqid: '1065213',
} as const;

const SUGGEST_LIMIT = 10;
const SUGGEST_DATASET = 2;
const SUGGEST_MODE = 4;

export function suggestUrl(lang: string, country: string): string {
  const params = new URLSearchParams({ ...STATIC_QUERY_PARAMS, hl: lang, gl: country });
  return `${BATCH_URL}?${params.toString()}`;
}

export function buildSuggestPayload(term: string): unknown[] {
  return [[null, [term], [SUGGEST_LIMIT], [SUGGEST_DATASET], SUGGEST_MODE]];
}

export const SUGGESTIONS_PATH: Path = [0, 0];
export const SUGGESTION_TEXT_PATH: Path = [0];
