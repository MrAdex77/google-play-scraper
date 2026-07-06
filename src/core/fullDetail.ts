import type { RequestOptions } from './options.js';

export interface FullDetailOptions {
  lang: string;
  country: string;
  throttle?: number;
  requestOptions?: RequestOptions;
}

export interface GetAppParams {
  appId: string;
  lang: string;
  country: string;
  throttle?: number;
  requestOptions?: RequestOptions;
}

export type GetApp<Result> = (params: GetAppParams) => Promise<Result>;

const DEFAULT_CONCURRENCY = 3;

export async function resolveFullDetail<Result>(
  items: readonly { appId: string }[],
  options: FullDetailOptions,
  getApp: GetApp<Result>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<Result[]> {
  const results: Result[] = new Array<Result>(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      results[index] = await getApp({
        appId: item.appId,
        lang: options.lang,
        country: options.country,
        throttle: options.throttle,
        requestOptions: options.requestOptions,
      });
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
