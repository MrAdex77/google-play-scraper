import type { RequestOptions } from './options.js';
import {
  BlockedError,
  GooglePlayError,
  HttpError,
  NotFoundError,
  RateLimitError,
} from './errors.js';

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
}

export type Limiter = (signal?: AbortSignal) => Promise<void>;

export interface RequestEvent {
  url: string;
  method: 'GET' | 'POST';
  attempt: number;
}

export interface ResponseEvent extends RequestEvent {
  status: number;
  durationMs: number;
}

export interface RetryEvent extends RequestEvent {
  delayMs: number;
  reason: 'status' | 'network';
  status?: number;
}

export type OnRequest = (event: RequestEvent) => void;
export type OnResponse = (event: ResponseEvent) => void;
export type OnRetry = (event: RetryEvent) => void;

export interface HttpClientConfig {
  fetchImpl?: typeof fetch;
  throttle?: number;
  limiter?: Limiter;
  retries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onRequest?: OnRequest;
  onResponse?: OnResponse;
  onRetry?: OnRetry;
}

export interface HttpClient {
  request(req: HttpRequest): Promise<string>;
}

export type ResolveClient = (opts: {
  throttle?: number;
  requestOptions?: RequestOptions;
}) => HttpClient;

const DEFAULT_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30000;
const BASE_BACKOFF_MS = 500;
const THROTTLE_WINDOW_MS = 1000;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const ANY_MIME = '*';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Accept: `text/html,${ANY_MIME}/${ANY_MIME}`,
  'Accept-Language': 'en-US,en;q=0.9',
};

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded;charset=UTF-8';

const DELTA_SECONDS = /^\d+$/;

const HTTP_DATE_DAY_NAME = /^[A-Za-z]{3}/;

const MAX_RETRY_AFTER_MS = 60000;

function settleAfter(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve) => {
    const settle = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', settle);
      resolve();
    };
    const timer = setTimeout(settle, Math.max(0, ms));
    signal?.addEventListener('abort', settle, { once: true });
  });
}

function settledOrAborted(pending: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
  if (signal === undefined) {
    return pending;
  }
  return new Promise<void>((resolve) => {
    const settle = (): void => {
      signal.removeEventListener('abort', settle);
      resolve();
    };
    signal.addEventListener('abort', settle, { once: true });
    pending.then(settle, settle);
  }).then(() => {
    signal.throwIfAborted();
    return pending;
  });
}

async function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  signal?.throwIfAborted();
  await settleAfter(ms, signal);
  signal?.throwIfAborted();
}

function emit<Event>(hook: ((event: Event) => unknown) | undefined, event: Event): void {
  if (hook === undefined) {
    return;
  }
  try {
    const result = hook(event);
    if (result instanceof Promise) {
      result.catch(() => undefined);
    }
  } catch {
    return;
  }
}

export function createRateLimiter(rate: number): Limiter {
  let timestamps: number[] = [];
  let tail: Promise<void> = Promise.resolve();

  const reserve = async (signal: AbortSignal | undefined): Promise<void> => {
    signal?.throwIfAborted();
    const now = Date.now();
    const windowStart = now - THROTTLE_WINDOW_MS;
    timestamps = timestamps.filter((timestamp) => timestamp > windowStart);
    if (timestamps.length >= rate) {
      const oldest = timestamps[0] ?? now;
      await wait(oldest + THROTTLE_WINDOW_MS - now, signal);
      return reserve(signal);
    }
    timestamps.push(Date.now());
  };

  return (signal) => {
    const result = tail.then(() => reserve(signal));
    tail = result.catch(() => undefined);
    return settledOrAborted(result, signal);
  };
}

function buildHeaders(
  method: 'GET' | 'POST',
  configHeaders: Record<string, string> | undefined,
  requestHeaders: Record<string, string> | undefined,
): Record<string, string> {
  const headers: Record<string, string> = { ...DEFAULT_HEADERS };
  if (method === 'POST') {
    headers['Content-Type'] = FORM_CONTENT_TYPE;
  }
  Object.assign(headers, configHeaders ?? {}, requestHeaders ?? {});
  return headers;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryAfterDateMs(header: string, response: Response): number | undefined {
  const until = HTTP_DATE_DAY_NAME.test(header) ? Date.parse(header) : Number.NaN;
  if (Number.isNaN(until)) {
    return undefined;
  }
  const serverDate = Date.parse(response.headers.get('date') ?? '');
  const from = Number.isNaN(serverDate) ? Date.now() : serverDate;
  const waitMs = until - from;
  return waitMs > 0 ? waitMs : undefined;
}

function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (header === null) {
    return undefined;
  }
  return DELTA_SECONDS.test(header) ? Number(header) * 1000 : retryAfterDateMs(header, response);
}

function jitteredBackoff(attempt: number): number {
  return Math.random() * (BASE_BACKOFF_MS * 2 ** attempt);
}

function mapStatusToError(status: number, url: string): GooglePlayError {
  if (status === 404) {
    return new NotFoundError('App not found (404)', status, url);
  }
  if (status === 429) {
    return new RateLimitError('Rate limited by Google Play (429)', status, url);
  }
  return new HttpError(`Request to ${url} failed with status ${status.toString()}`, status, url);
}

function buildRequestSignal(timeoutMs: number, signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

function hostIsConsent(finalUrl: string): boolean {
  if (!finalUrl) {
    return false;
  }
  try {
    return new URL(finalUrl).host === 'consent.google.com';
  } catch {
    return false;
  }
}

function assertNotBlocked(response: Response, body: string): void {
  if (
    hostIsConsent(response.url) ||
    body.includes('www.google.com/recaptcha') ||
    body.includes('unusual traffic')
  ) {
    throw new BlockedError('Blocked by Google Play (consent wall or captcha)');
  }
}

export function createHttpClient(config: HttpClientConfig = {}): HttpClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const retries = config.retries ?? DEFAULT_RETRIES;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const callerSignal = config.signal;
  const limiter =
    config.limiter ??
    (config.throttle !== undefined ? createRateLimiter(config.throttle) : undefined);

  const request = async (req: HttpRequest): Promise<string> => {
    const method = req.method ?? 'GET';
    const headers = buildHeaders(method, config.headers, req.headers);
    const eventFor = (attempt: number): RequestEvent => ({
      url: req.url,
      method,
      attempt: attempt + 1,
    });

    for (let attempt = 0; ; attempt += 1) {
      callerSignal?.throwIfAborted();
      if (limiter) {
        await limiter(callerSignal);
      }
      callerSignal?.throwIfAborted();
      emit(config.onRequest, eventFor(attempt));
      const startedAt = performance.now();
      try {
        const response = await fetchImpl(req.url, {
          method,
          headers,
          body: req.body,
          signal: buildRequestSignal(timeoutMs, callerSignal),
        });

        if (response.ok) {
          const body = await response.text();
          emit(config.onResponse, {
            ...eventFor(attempt),
            status: response.status,
            durationMs: performance.now() - startedAt,
          });
          assertNotBlocked(response, body);
          return body;
        }

        emit(config.onResponse, {
          ...eventFor(attempt),
          status: response.status,
          durationMs: performance.now() - startedAt,
        });

        const retryAfterMs = parseRetryAfter(response);
        const honored = retryAfterMs === undefined || retryAfterMs <= MAX_RETRY_AFTER_MS;
        if (isRetryableStatus(response.status) && attempt < retries && honored) {
          const delayMs = retryAfterMs ?? jitteredBackoff(attempt);
          emit(config.onRetry, {
            ...eventFor(attempt),
            delayMs,
            reason: 'status',
            status: response.status,
          });
          await wait(delayMs, callerSignal);
          continue;
        }

        throw mapStatusToError(response.status, req.url);
      } catch (error) {
        if (error instanceof GooglePlayError) {
          throw error;
        }
        if (callerSignal?.aborted) {
          throw error;
        }
        if (attempt < retries) {
          const delayMs = jitteredBackoff(attempt);
          emit(config.onRetry, { ...eventFor(attempt), delayMs, reason: 'network' });
          await wait(delayMs, callerSignal);
          continue;
        }
        const httpError = new HttpError(`Network request to ${req.url} failed`, 0, req.url);
        httpError.cause = error;
        throw httpError;
      }
    }
  };

  return { request };
}

export function clientFromOptions(opts: {
  throttle?: number;
  requestOptions?: RequestOptions;
}): HttpClient {
  return createHttpClient({
    throttle: opts.throttle,
    fetchImpl: opts.requestOptions?.fetchImpl,
    retries: opts.requestOptions?.retries,
    timeoutMs: opts.requestOptions?.timeoutMs,
    headers: opts.requestOptions?.headers,
    signal: opts.requestOptions?.signal,
    onRequest: opts.requestOptions?.onRequest,
    onResponse: opts.requestOptions?.onResponse,
    onRetry: opts.requestOptions?.onRetry,
  });
}
