import type { Device, ReviewsOptions, ReviewsResult } from '../src/index.ts';
import { liveClient } from './helpers.ts';

export const REVIEW_FILTER_ANCHORS = [
  'com.whatsapp',
  'com.google.android.youtube',
  'com.netflix.mediaclient',
  'com.facebook.katana',
] as const;

type ReviewFilterOptions = Omit<
  ReviewsOptions,
  'appId' | 'paginate' | 'num' | 'nextPaginationToken'
>;

export type ReviewFilter = ReviewFilterOptions &
  ({ device: Device } | { score: NonNullable<ReviewsOptions['score']> });

export interface ReviewFilterAnchor {
  appId: string;
  page: ReviewsResult;
  token: string;
}

function describeFilter(filter: ReviewFilter): string {
  const { device, score, sort, pageSize } = filter;
  return JSON.stringify({ device, score, sort, pageSize });
}

export async function findReviewFilterAnchor(
  filter: ReviewFilter,
  label: string,
): Promise<ReviewFilterAnchor> {
  for (const appId of REVIEW_FILTER_ANCHORS) {
    const page = await liveClient.reviews({ appId, paginate: true, ...filter });
    if (page.data.length > 0 && page.nextPaginationToken !== null) {
      return { appId, page, token: page.nextPaginationToken };
    }
  }
  throw new Error(
    `${label}: no review filter anchor serves a page with a token for ${describeFilter(filter)}: google changed the review filter regime, re-anchor REVIEW_FILTER_ANCHORS in e2e/reviewAnchors.ts`,
  );
}
