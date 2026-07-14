import { z } from 'zod';
import { buildBatchBody, parseBatchResponse } from '../../core/batchexecute.js';
import { clientFromOptions, type ResolveClient } from '../../core/http.js';
import { baseOptionsSchema, parseOptions } from '../../core/options.js';
import { getPath } from '../../core/path.js';
import {
  buildSuggestPayload,
  SUGGEST_RPC_ID,
  SUGGESTION_TEXT_PATH,
  SUGGESTIONS_PATH,
  suggestUrl,
} from './specs.js';

export const suggestOptionsSchema = baseOptionsSchema.extend({
  term: z.string().min(1),
});

export type SuggestOptions = z.input<typeof suggestOptionsSchema>;

const SUGGEST_CONTEXT = 'suggest';
const MAX_SUGGESTIONS = 5;

export function createSuggest(resolveClient: ResolveClient = clientFromOptions) {
  return async function suggest(options: SuggestOptions): Promise<string[]> {
    const parsed = parseOptions(suggestOptionsSchema, options, SUGGEST_CONTEXT);

    const client = resolveClient(parsed);
    const body = buildBatchBody(SUGGEST_RPC_ID, buildSuggestPayload(parsed.term), []);
    const text = await client.request({
      url: suggestUrl(parsed.lang, parsed.country),
      method: 'POST',
      body,
    });

    const payload = parseBatchResponse(text, SUGGEST_RPC_ID);
    if (payload === null) {
      return [];
    }

    const entries = getPath(payload, SUGGESTIONS_PATH);
    if (!Array.isArray(entries)) {
      return [];
    }

    const suggestions = z
      .array(z.string())
      .parse(entries.map((entry) => getPath(entry, SUGGESTION_TEXT_PATH)));

    return suggestions.slice(0, MAX_SUGGESTIONS);
  };
}

export const suggest = createSuggest();
