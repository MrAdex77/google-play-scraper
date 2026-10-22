import { mapWithConcurrency } from './concurrency.ts';
import type { ObservabilityOptions, RequestOptions } from './options.ts';

export interface FullDetailOptions extends ObservabilityOptions {
  lang: string;
  country: string;
  throttle?: number;
  requestOptions?: RequestOptions;
}

export interface GetAppParams extends ObservabilityOptions {
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
  return mapWithConcurrency(items, concurrency, (item) =>
    getApp({
      appId: item.appId,
      lang: options.lang,
      country: options.country,
      throttle: options.throttle,
      requestOptions: options.requestOptions,
      onDegradation: options.onDegradation,
      onIntegrityEvent: options.onIntegrityEvent,
    }),
  );
}
