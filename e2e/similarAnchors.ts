import { NotFoundError } from '../src/core/errors.ts';
import type { ResolveClient } from '../src/core/http.ts';
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

export async function fetchListedSimilarFirstPage(
  query: SimilarQuery,
  resolveClient: ResolveClient,
): Promise<SimilarFirstPage | undefined> {
  try {
    return await fetchSimilarFirstPage(query, resolveClient);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return undefined;
    }
    throw error;
  }
}

export async function findSimilarContinuationAnchor(
  appIds: readonly string[],
  resolveClient: ResolveClient,
  storefront: Storefront = DEFAULT_STOREFRONT,
): Promise<SimilarContinuationAnchor> {
  for (const appId of appIds) {
    const query = similarQueryFor(appId, storefront);
    const first = await fetchListedSimilarFirstPage(query, resolveClient);
    if (first?.token !== undefined) {
      return { ...first, query, token: first.token };
    }
  }
  throw new Error(
    `no similar anchor among ${appIds.join(', ')} serves a first page with a continuation token for ${JSON.stringify(storefront)}: re-anchor that pool in e2e/similarAnchors.ts or repair the token path, see "Similar continuation pool" in docs/RUNBOOK.md`,
  );
}
