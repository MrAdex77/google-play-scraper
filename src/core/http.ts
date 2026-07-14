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

export type Limiter = () => Promise<void>;

export interface HttpClientConfig {
  fetchImpl?: typeof fetch;
  throttle?: number;
  limiter?: Limiter;
  retries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
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

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export function createRateLimiter(rate: number): Limiter {
  let timestamps: number[] = [];
  let tail: Promise<void> = Promise.resolve();

  const reserve = async (): Promise<void> => {
    const now = Date.now();
    const windowStart = now - THROTTLE_WINDOW_MS;
    timestamps = timestamps.filter((timestamp) => timestamp > windowStart);
    if (timestamps.length >= rate) {
      const oldest = timestamps[0] ?? now;
      await sleep(oldest + THROTTLE_WINDOW_MS - now);
      return reserve();
    }
    timestamps.push(Date.now());
  };

  return () => {
    const result = tail.then(reserve);
    tail = result.catch(() => undefined);
    return result;
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

function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (header === null) {
    return undefined;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function computeBackoff(attempt: number, retryAfterSeconds: number | undefined): number {
  if (retryAfterSeconds !== undefined) {
    return retryAfterSeconds * 1000;
  }
  const ceiling = BASE_BACKOFF_MS * 2 ** attempt;
  return Math.random() * ceiling;
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

    for (let attempt = 0; ; attempt += 1) {
      if (limiter) {
        await limiter();
      }
      try {
        const response = await fetchImpl(req.url, {
          method,
          headers,
          body: req.body,
          signal: buildRequestSignal(timeoutMs, callerSignal),
        });

        if (response.ok) {
          const body = await response.text();
          assertNotBlocked(response, body);
          return body;
        }

        if (isRetryableStatus(response.status) && attempt < retries) {
          await sleep(computeBackoff(attempt, parseRetryAfter(response)));
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
          await sleep(computeBackoff(attempt, undefined));
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
  });
}
