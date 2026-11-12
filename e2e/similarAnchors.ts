import { clientFromOptions, type ResolveClient } from '../src/core/http.ts';
import {
  fetchSimilarFirstPage,
  type SimilarFirstPage,
  type SimilarQuery,
} from '../src/features/similar/similar.ts';
import type { Storefront } from './helpers.ts';

export const SIMILAR_CONTINUATION_ANCHORS = [
  'com.google.android.apps.translate',
  'com.whatsapp',
  'com.spotify.music',
  'com.duolingo',
] as const;

export const PAID_SIMILAR_CONTINUATION_ANCHORS = [
  'com.and.games505.TerrariaPaid',
  'com.ustwo.monumentvalley',
  'com.robtopx.geometryjump',
  'com.mojang.minecraftpe',
] as const;

export const SPARSE_SIMILAR_ANCHORS = [
  'com.tencent.mhadv',
  'com.innersloth.spacemafia',
  'com.robtopx.geometryjump',
  'com.nianticlabs.pokemongo',
] as const;

const DEFAULT_STOREFRONT: Storefront = { country: 'us', lang: 'en' };

export interface SimilarContinuationAnchor extends SimilarFirstPage {
  query: SimilarQuery;
  token: string;
}

export function similarQueryFor(
  appId: string,
  storefront: Storefront = DEFAULT_STOREFRONT,
): SimilarQuery {
  return { appId, ...storefront, throttle: 1 };
}

export async function findSimilarContinuationAnchor(
  appIds: readonly string[],
  resolveClient: ResolveClient = clientFromOptions,
  storefront: Storefront = DEFAULT_STOREFRONT,
): Promise<SimilarContinuationAnchor> {
  for (const appId of appIds) {
    const query = similarQueryFor(appId, storefront);
    const first = await fetchSimilarFirstPage(query, resolveClient);
    if (first.token !== undefined) {
      return { ...first, query, token: first.token };
    }
  }
  throw new Error(
    `no similar continuation anchor among ${appIds.join(', ')} serves a token for ${JSON.stringify(storefront)}: google stopped paginating similar clusters or the first page token moved, follow "Similar continuation pool" in docs/RUNBOOK.md`,
  );
}
