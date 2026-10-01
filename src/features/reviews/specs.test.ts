import { describe, expect, it } from 'vitest';
import { device, sort } from '../../constants.ts';
import {
  buildReviewsBody,
  DEFAULT_REVIEWS_PAGE_SIZE,
  DEVICE_IDS,
  MAX_REVIEWS_PAGE_SIZE,
} from './specs.ts';

const TRANSLATE = 'com.google.android.apps.translate';
const TOKEN = 'CtgBIs8BAU60USdTESTTOKEN==';

const legacyInitialBody = (sortValue: number, appId: string): string =>
  `f.req=%5B%5B%5B%22UsvDTd%22%2C%22%5Bnull%2Cnull%2C%5B2%2C${sortValue.toString()}%2C%5B150%2Cnull%2Cnull%5D%2Cnull%2C%5B%5D%5D%2C%5B%5C%22${appId}%5C%22%2C7%5D%5D%22%2Cnull%2C%22generic%22%5D%5D%5D`;

const legacyPaginatedBody = (sortValue: number, appId: string, withToken: string): string =>
  `f.req=%5B%5B%5B%22UsvDTd%22%2C%22%5Bnull%2Cnull%2C%5B2%2C${sortValue.toString()}%2C%5B150%2Cnull%2C%5C%22${withToken}%5C%22%5D%2Cnull%2C%5B%5D%5D%2C%5B%5C%22${appId}%5C%22%2C7%5D%5D%22%2Cnull%2C%22generic%22%5D%5D%5D`;

const EMPTY_FILTER_SLOT = '%2Cnull%2C%5B%5D%5D%2C%5B%5C%22';

describe('buildReviewsBody', () => {
  it.each([sort.NEWEST, sort.RATING, sort.HELPFULNESS])(
    'is byte-identical to the previous initial body for sort %i',
    (sortValue) => {
      const body = buildReviewsBody({
        appId: TRANSLATE,
        sort: sortValue,
        count: DEFAULT_REVIEWS_PAGE_SIZE,
      });
      expect(body).toBe(legacyInitialBody(sortValue, TRANSLATE));
    },
  );

  it('is byte-identical to the previous paginated body when a token is supplied', () => {
    const body = buildReviewsBody({
      appId: TRANSLATE,
      sort: sort.RATING,
      count: DEFAULT_REVIEWS_PAGE_SIZE,
      token: TOKEN,
    });
    expect(body).toBe(legacyPaginatedBody(sort.RATING, TRANSLATE, TOKEN));
  });

  it('places the requested count in the page slot and keeps the filter slot empty', () => {
    const body = buildReviewsBody({ appId: TRANSLATE, sort: sort.NEWEST, count: 10 });
    expect(body).toContain('%5B10%2Cnull%2Cnull%5D');
    expect(body).toContain(EMPTY_FILTER_SLOT);
  });

  it('encodes a score filter at index one of a nine element filter array', () => {
    const body = buildReviewsBody({ appId: TRANSLATE, sort: sort.NEWEST, count: 40, score: 4 });
    expect(body).toContain(
      '%2Cnull%2C%5Bnull%2C4%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%5D%5D%2C%5B%5C%22',
    );
  });

  it('encodes a device filter at index eight', () => {
    const body = buildReviewsBody({
      appId: TRANSLATE,
      sort: sort.NEWEST,
      count: 40,
      device: device.TABLET,
    });
    expect(body).toContain(
      '%2Cnull%2C%5Bnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2C3%5D%5D%2C%5B%5C%22',
    );
  });

  it('encodes the wear os watch device as id four', () => {
    const body = buildReviewsBody({
      appId: TRANSLATE,
      sort: sort.RATING,
      count: 25,
      device: device.WATCH,
    });
    expect(body).toContain(
      '%2Cnull%2C%5Bnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2C4%5D%5D%2C%5B%5C%22',
    );
  });

  it('encodes a score and a device in one filter array next to a token', () => {
    const body = buildReviewsBody({
      appId: TRANSLATE,
      sort: sort.NEWEST,
      count: 40,
      token: TOKEN,
      score: 5,
      device: device.TV,
    });
    expect(body).toContain(`%5B40%2Cnull%2C%5C%22${TOKEN}%5C%22%5D`);
    expect(body).toContain('%5Bnull%2C5%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2Cnull%2C6%5D');
  });

  it('maps every device name to the google play device id', () => {
    expect(DEVICE_IDS).toEqual({ mobile: 2, tablet: 3, watch: 4, chromebook: 5, tv: 6 });
    expect(Object.keys(DEVICE_IDS).sort()).toEqual(Object.values(device).sort());
  });

  it('pins the measured page size bounds', () => {
    expect(DEFAULT_REVIEWS_PAGE_SIZE).toBe(150);
    expect(MAX_REVIEWS_PAGE_SIZE).toBe(4500);
  });
});
