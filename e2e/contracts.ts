import { expect } from 'vitest';
import type { App, AppItem, Review } from '../src/index.js';

const PLAY_ORIGIN = 'https://play.google.com';
const HTTPS_PROTOCOL = 'https:';
const MAX_SCORE = 5;
const SCORE_TEXT_ROUNDING_TOLERANCE = 0.051;
const HISTOGRAM_LAG_RATIO = 0.01;
const HISTOGRAM_LAG_FLOOR = 10;
const ONE_DECIMAL_SCORE_TEXT = /^\d+[.,]\d+$/;
const ASCII_DIGIT = /[0-9]/;
const NON_ASCII_DIGIT = /[^0-9]/g;
const ABBREVIATED_SCALE_LETTER = /\p{L}/u;
const QUOTED_PRICE_DIGIT = /\p{Nd}/u;
const ANDROID_MARKET_LAUNCH_MS = 1_223_856_000_000;
const CLOCK_SKEW_TOLERANCE_MS = 172_800_000;
const OFFERLESS_PRICE_TEXT = 'Free';

export interface OfferFields {
  price: number;
  free: boolean;
  currency?: string;
}

export interface RatingFields {
  score?: number;
  scoreText?: string;
}

function roundedScoreText(scoreText: string): number | undefined {
  if (!ONE_DECIMAL_SCORE_TEXT.test(scoreText)) {
    return undefined;
  }
  return Number.parseFloat(scoreText.replace(',', '.'));
}

function groupedDigitsValue(text: string): number | undefined {
  if (!ASCII_DIGIT.test(text) || ABBREVIATED_SCALE_LETTER.test(text)) {
    return undefined;
  }
  return Number.parseInt(text.replace(NON_ASCII_DIGIT, ''), 10);
}

function histogramTotal(histogram: App['histogram']): number {
  return Object.values(histogram).reduce((sum, count) => sum + count, 0);
}

export function expectOfferConsistency(offer: OfferFields, label: string): void {
  expect(Number.isFinite(offer.price), `${label}: price must be a finite number`).toBe(true);
  expect(offer.price, `${label}: price must never be negative`).toBeGreaterThanOrEqual(0);

  if (offer.free) {
    expect(offer.price, `${label}: a free listing must cost zero`).toBe(0);
    return;
  }
  if (offer.currency === undefined) {
    expect(offer.price, `${label}: a listing without an offer node must cost zero`).toBe(0);
    return;
  }
  expect(offer.price, `${label}: a paid listing must cost more than zero`).toBeGreaterThan(0);
}

export function expectRatingConsistency(rating: RatingFields, label: string): void {
  expect(
    rating.score === undefined,
    `${label}: score and scoreText must be present together, got score=${String(rating.score)} scoreText=${String(rating.scoreText)}`,
  ).toBe(rating.scoreText === undefined);

  if (rating.score === undefined || rating.scoreText === undefined) {
    return;
  }

  expect(rating.score, `${label}: score must not be below zero`).toBeGreaterThanOrEqual(0);
  expect(
    rating.score,
    `${label}: score must not exceed ${MAX_SCORE.toString()}`,
  ).toBeLessThanOrEqual(MAX_SCORE);

  const rounded = roundedScoreText(rating.scoreText);
  if (rounded === undefined) {
    return;
  }
  expect(
    Math.abs(rounded - rating.score),
    `${label}: scoreText "${rating.scoreText}" must round score ${rating.score.toString()}`,
  ).toBeLessThanOrEqual(SCORE_TEXT_ROUNDING_TOLERANCE);
}

export function expectAppItemContract(item: AppItem, label: string): void {
  const scoped = `${label} ${item.appId}`;

  expect(item.appId.length, `${label}: appId must not be empty`).toBeGreaterThan(0);
  expect(item.title.length, `${scoped}: title must not be empty`).toBeGreaterThan(0);
  expect(item.developer.length, `${scoped}: developer must not be empty`).toBeGreaterThan(0);
  expect(new URL(item.url).origin, `${scoped}: url must address the play store`).toBe(PLAY_ORIGIN);
  expect(item.url, `${scoped}: url must carry the same appId as the item`).toContain(item.appId);
  expect(new URL(item.icon).protocol, `${scoped}: icon must be served over https`).toBe(
    HTTPS_PROTOCOL,
  );

  expectOfferConsistency(item, scoped);
  expectRatingConsistency(item, scoped);
}

export function expectAppItemsContract(items: readonly AppItem[], label: string): void {
  for (const item of items) {
    expectAppItemContract(item, label);
  }
  expect(
    new Set(items.map((item) => item.appId)).size,
    `${label}: every returned appId must be unique`,
  ).toBe(items.length);
}

export function expectReviewContract(review: Review, label: string): void {
  const scoped = `${label} ${review.id}`;

  expect(review.id.length, `${label}: review id must not be empty`).toBeGreaterThan(0);
  expect(review.userName.length, `${scoped}: userName must not be empty`).toBeGreaterThan(0);
  expect(review.score, `${scoped}: score must be at least one star`).toBeGreaterThanOrEqual(1);
  expect(
    review.score,
    `${scoped}: score must not exceed ${MAX_SCORE.toString()}`,
  ).toBeLessThanOrEqual(MAX_SCORE);
  expect(Number.isNaN(Date.parse(review.date)), `${scoped}: date must parse`).toBe(false);
  expect(
    Date.parse(review.date),
    `${scoped}: date must sit after the store launched`,
  ).toBeGreaterThan(ANDROID_MARKET_LAUNCH_MS);
  expect(Date.parse(review.date), `${scoped}: date must not sit in the future`).toBeLessThan(
    Date.now() + CLOCK_SKEW_TOLERANCE_MS,
  );

  if (review.replyDate !== undefined) {
    expect(
      Date.parse(review.replyDate),
      `${scoped}: a developer reply must sit after the store launched`,
    ).toBeGreaterThan(ANDROID_MARKET_LAUNCH_MS);
    expect(
      Date.parse(review.replyDate),
      `${scoped}: a developer reply must not sit in the future`,
    ).toBeLessThan(Date.now() + CLOCK_SKEW_TOLERANCE_MS);
  }
  if (review.thumbsUp !== undefined) {
    expect(review.thumbsUp, `${scoped}: thumbsUp must not be negative`).toBeGreaterThanOrEqual(0);
  }
  if (review.userImage !== undefined) {
    expect(new URL(review.userImage).protocol, `${scoped}: userImage must be https`).toBe(
      HTTPS_PROTOCOL,
    );
  }
}

export function expectReviewsContract(reviews: readonly Review[], label: string): void {
  for (const review of reviews) {
    expectReviewContract(review, label);
  }
  expect(
    new Set(reviews.map((review) => review.id)).size,
    `${label}: every returned review id must be unique`,
  ).toBe(reviews.length);
}

export function expectInstallsConsistency(listing: App, label: string): void {
  expect(
    listing.minInstalls !== undefined,
    `${label}: installs and minInstalls must be present together`,
  ).toBe(listing.installs !== undefined);

  if (listing.maxInstalls !== undefined) {
    expect(
      listing.maxInstalls,
      `${label}: maxInstalls must not be negative`,
    ).toBeGreaterThanOrEqual(0);
  }

  if (listing.installs === undefined || listing.minInstalls === undefined) {
    return;
  }

  expect(listing.minInstalls, `${label}: minInstalls must be positive`).toBeGreaterThan(0);
  if (listing.maxInstalls !== undefined) {
    expect(
      listing.maxInstalls,
      `${label}: maxInstalls must not fall below minInstalls`,
    ).toBeGreaterThanOrEqual(listing.minInstalls);
  }

  const formatted = groupedDigitsValue(listing.installs);
  if (formatted === undefined) {
    return;
  }
  expect(formatted, `${label}: installs "${listing.installs}" must spell out minInstalls`).toBe(
    listing.minInstalls,
  );
}

export function expectRatingSurfaceConsistency(listing: App, label: string): void {
  const total = histogramTotal(listing.histogram);
  for (const [star, count] of Object.entries(listing.histogram)) {
    expect(count, `${label}: histogram bucket ${star} must not be negative`).toBeGreaterThanOrEqual(
      0,
    );
  }

  if (listing.ratings === undefined) {
    expect(
      listing.score,
      `${label}: a listing without ratings must carry no score`,
    ).toBeUndefined();
    expect(total, `${label}: a listing without ratings must carry an empty histogram`).toBe(0);
    expect(
      listing.reviews,
      `${label}: a listing without ratings must carry no review count`,
    ).toBeUndefined();
    return;
  }

  expect(listing.score, `${label}: a rated listing must carry a score`).toBeDefined();

  const lag = Math.max(HISTOGRAM_LAG_FLOOR, Math.ceil(listing.ratings * HISTOGRAM_LAG_RATIO));
  const histogramMessage = `${label}: histogram total ${total.toString()} must track the rating count ${listing.ratings.toString()}`;
  expect(total, histogramMessage).toBeGreaterThanOrEqual(listing.ratings - lag);
  expect(total, histogramMessage).toBeLessThanOrEqual(listing.ratings + lag);

  if (listing.reviews !== undefined) {
    expect(
      listing.reviews,
      `${label}: the review count must not exceed the rating count`,
    ).toBeLessThanOrEqual(listing.ratings);
  }
}

export function expectPurchaseConsistency(listing: App, label: string): void {
  if (listing.IAPRange === undefined || listing.IAPRange.length === 0) {
    return;
  }
  expect(
    QUOTED_PRICE_DIGIT.test(listing.IAPRange),
    `${label}: IAPRange "${listing.IAPRange}" must quote a price`,
  ).toBe(true);
}

export function expectOfferNodeConsistency(listing: App, label: string): void {
  if (listing.currency !== undefined) {
    expect(
      listing.priceText.length,
      `${label}: a listing carrying an offer node must quote a price text`,
    ).toBeGreaterThan(0);
    return;
  }

  expect(listing.price, `${label}: a listing without an offer node must cost zero`).toBe(0);
  expect(listing.free, `${label}: a free offer cannot be read without the currency beside it`).toBe(
    false,
  );
  expect(
    listing.priceText,
    `${label}: a listing without an offer node falls back to "${OFFERLESS_PRICE_TEXT}"`,
  ).toBe(OFFERLESS_PRICE_TEXT);
  expect(
    listing.originalPrice,
    `${label}: a listing without an offer node carries no original price`,
  ).toBeUndefined();
  expect(
    listing.discountEndDate,
    `${label}: a listing without an offer node carries no discount deadline`,
  ).toBeUndefined();
}

export function expectReleaseStateConsistency(listing: App, label: string): void {
  if (!listing.preregister) {
    return;
  }

  expect(listing.available, `${label}: a preregistration listing must read as available`).toBe(
    true,
  );
  expect(
    listing.released,
    `${label}: a preregistration listing has no release date`,
  ).toBeUndefined();
  expect(listing.installs, `${label}: a preregistration listing has no installs`).toBeUndefined();
  expect(
    listing.minInstalls,
    `${label}: a preregistration listing has no minInstalls`,
  ).toBeUndefined();
  expect(listing.ratings, `${label}: a preregistration listing has no ratings`).toBeUndefined();
  expect(listing.score, `${label}: a preregistration listing has no score`).toBeUndefined();
  expect(
    histogramTotal(listing.histogram),
    `${label}: a preregistration listing has an empty histogram`,
  ).toBe(0);
}

export function expectListingContract(listing: App, label: string): void {
  const scoped = `${label} ${listing.appId}`;

  expect(listing.appId.length, `${label}: appId must not be empty`).toBeGreaterThan(0);
  expect(listing.title.length, `${scoped}: title must not be empty`).toBeGreaterThan(0);
  expect(listing.description.length, `${scoped}: description must not be empty`).toBeGreaterThan(0);
  expect(
    listing.descriptionHTML.length,
    `${scoped}: descriptionHTML must not be empty`,
  ).toBeGreaterThan(0);
  expect(listing.developer.length, `${scoped}: developer must not be empty`).toBeGreaterThan(0);
  expect(listing.developerId.length, `${scoped}: developerId must not be empty`).toBeGreaterThan(0);
  expect(listing.genreId.length, `${scoped}: genreId must not be empty`).toBeGreaterThan(0);
  expect(new URL(listing.url).origin, `${scoped}: url must address the play store`).toBe(
    PLAY_ORIGIN,
  );
  expect(listing.url, `${scoped}: url must carry the same appId as the listing`).toContain(
    listing.appId,
  );
  expect(new URL(listing.icon).protocol, `${scoped}: icon must be served over https`).toBe(
    HTTPS_PROTOCOL,
  );
  expect(
    listing.screenshots.length,
    `${scoped}: a listing must publish screenshots`,
  ).toBeGreaterThan(0);
  for (const screenshot of listing.screenshots) {
    expect(new URL(screenshot).protocol, `${scoped}: screenshots must be served over https`).toBe(
      HTTPS_PROTOCOL,
    );
  }
  expect(listing.categories.length, `${scoped}: a listing must carry a category`).toBeGreaterThan(
    0,
  );
  for (const category of listing.categories) {
    expect(category.name.length, `${scoped}: category names must not be empty`).toBeGreaterThan(0);
  }
  expect(listing.updated, `${scoped}: updated must sit after the store launched`).toBeGreaterThan(
    ANDROID_MARKET_LAUNCH_MS,
  );
  expect(listing.updated, `${scoped}: updated must not sit in the future`).toBeLessThan(
    Date.now() + CLOCK_SKEW_TOLERANCE_MS,
  );

  expectOfferConsistency(listing, scoped);
  expectOfferNodeConsistency(listing, scoped);
  expectRatingConsistency(listing, scoped);
  expectRatingSurfaceConsistency(listing, scoped);
  expectInstallsConsistency(listing, scoped);
  expectPurchaseConsistency(listing, scoped);
  expectReleaseStateConsistency(listing, scoped);
}
