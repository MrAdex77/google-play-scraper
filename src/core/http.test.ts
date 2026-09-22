import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clientFromOptions,
  createHttpClient,
  createRateLimiter,
  type OnResponse,
  type RequestEvent,
  type ResponseEvent,
  type RetryEvent,
} from './http.js';
import { BlockedError, HttpError, NotFoundError, RateLimitError } from './errors.js';

interface FakeResponseInit {
  body?: string;
  status?: number;
  url?: string;
  headers?: Record<string, string>;
}

const fakeResponse = (init: FakeResponseInit = {}): Response => {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    url: init.url ?? 'https://play.google.com/store',
    headers: new Headers(init.headers ?? {}),
    text: () => Promise.resolve(init.body ?? ''),
  } as unknown as Response;
};

const lastInit = (fetchImpl: ReturnType<typeof vi.fn>): RequestInit => {
  const call = fetchImpl.mock.calls[0] as [string, RequestInit];
  return call[1];
};

const headersOf = (fetchImpl: ReturnType<typeof vi.fn>): Record<string, string> =>
  lastInit(fetchImpl).headers as Record<string, string>;

const abortAwareFetch = () =>
  vi.fn((_input: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal;
    return signal?.aborted
      ? Promise.reject(signal.reason as Error)
      : Promise.resolve(fakeResponse({ body: 'ok' }));
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createHttpClient', () => {
  it('returns the body text and sends default headers on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ body: 'hello world' }));
    const client = createHttpClient({ fetchImpl });

    const body = await client.request({ url: 'https://play.google.com/store' });

    expect(body).toBe('hello world');
    const headers = headersOf(fetchImpl);
    expect(headers['User-Agent']).toMatch(/Chrome/);
    expect(headers.Accept).toBe(`text/html,${['*', '*'].join('/')}`);
    expect(headers['Accept-Language']).toBe('en-US,en;q=0.9');
    expect(lastInit(fetchImpl).method).toBe('GET');
  });

  it('applies config over defaults and per request over config', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ body: 'ok' }));
    const client = createHttpClient({
      fetchImpl,
      headers: { 'User-Agent': 'config-agent', 'X-Custom': 'config' },
    });

    await client.request({ url: 'https://x', headers: { 'X-Custom': 'request' } });

    const headers = headersOf(fetchImpl);
    expect(headers['User-Agent']).toBe('config-agent');
    expect(headers['X-Custom']).toBe('request');
    expect(headers.Accept).toBe(`text/html,${['*', '*'].join('/')}`);
  });

  it('sends the form content type for POST bodies unless overridden', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ body: 'ok' }));
    const client = createHttpClient({ fetchImpl });

    await client.request({ url: 'https://x', method: 'POST', body: 'a=1' });

    const headers = headersOf(fetchImpl);
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded;charset=UTF-8');
    expect(lastInit(fetchImpl).body).toBe('a=1');
  });

  it('throws NotFoundError on 404 without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 404 }));
    const client = createHttpClient({ fetchImpl });

    await expect(client.request({ url: 'https://x' })).rejects.toBeInstanceOf(NotFoundError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a 500 then succeeds on the second attempt', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 500 }))
      .mockResolvedValueOnce(fakeResponse({ body: 'recovered' }));
    const client = createHttpClient({ fetchImpl });

    const pending = client.request({ url: 'https://x' });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBe('recovered');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError after exhausting retries and honors Retry-After', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse({ status: 429, headers: { 'Retry-After': '1' } }));
    const client = createHttpClient({ fetchImpl });

    const settled = client.request({ url: 'https://x' }).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    const error = await settled;
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).status).toBe(429);
  });

  it('ignores unparseable and negative Retry-After headers and still retries', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 429, headers: { 'Retry-After': 'soon' } }))
      .mockResolvedValueOnce(fakeResponse({ status: 429, headers: { 'Retry-After': '-5' } }))
      .mockResolvedValueOnce(fakeResponse({ body: 'ok' }));
    const client = createHttpClient({ fetchImpl });

    const pending = client.request({ url: 'https://x' });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('builds a client around the global fetch when nothing is injected', () => {
    const client = createHttpClient();
    expect(typeof client.request).toBe('function');
  });

  it('retries network rejections and surfaces an HttpError with the cause', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const boom = new TypeError('network down');
    const fetchImpl = vi.fn().mockRejectedValue(boom);
    const client = createHttpClient({ fetchImpl });

    const settled = client.request({ url: 'https://x' }).catch((error: unknown) => error);
    await vi.runAllTimersAsync();

    const error = await settled;
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).cause).toBe(boom);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throttles a burst of five requests to two per second', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const calls: number[] = [];
    const fetchImpl = vi.fn(() => {
      calls.push(Date.now() - start);
      return Promise.resolve(fakeResponse({ body: 'ok' }));
    });
    const client = createHttpClient({ fetchImpl, throttle: 2 });

    const pending = Promise.all(
      Array.from({ length: 5 }, () => client.request({ url: 'https://x' })),
    );
    await vi.runAllTimersAsync();
    await pending;

    expect(calls).toEqual([0, 0, 1000, 1000, 2000]);
  });

  it('serializes two clients that share one injected limiter to the shared rate', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const calls: number[] = [];
    const fetchImpl = vi.fn(() => {
      calls.push(Date.now() - start);
      return Promise.resolve(fakeResponse({ body: 'ok' }));
    });
    const limiter = createRateLimiter(2);
    const first = createHttpClient({ fetchImpl, limiter });
    const second = createHttpClient({ fetchImpl, limiter });

    const pending = Promise.all([
      first.request({ url: 'https://a' }),
      first.request({ url: 'https://a' }),
      second.request({ url: 'https://b' }),
      second.request({ url: 'https://b' }),
      first.request({ url: 'https://a' }),
    ]);
    await vi.runAllTimersAsync();
    await pending;

    expect(calls).toEqual([0, 0, 1000, 1000, 2000]);
  });

  it('prefers an injected limiter over the throttle config', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const calls: number[] = [];
    const fetchImpl = vi.fn(() => {
      calls.push(Date.now() - start);
      return Promise.resolve(fakeResponse({ body: 'ok' }));
    });
    const limiter = createRateLimiter(1);
    const client = createHttpClient({ fetchImpl, limiter, throttle: 5 });

    const pending = Promise.all(
      Array.from({ length: 3 }, () => client.request({ url: 'https://x' })),
    );
    await vi.runAllTimersAsync();
    await pending;

    expect(calls).toEqual([0, 1000, 2000]);
  });

  it('maps other non ok statuses to a generic HttpError without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 403 }));
    const client = createHttpClient({ fetchImpl });

    const settled = client.request({ url: 'https://x' }).catch((error: unknown) => error);
    const error = await settled;

    expect(error).toBeInstanceOf(HttpError);
    expect(error).not.toBeInstanceOf(NotFoundError);
    expect((error as HttpError).status).toBe(403);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not treat an unparseable final url as a consent block', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ body: 'clean', url: 'not a url' }));
    const client = createHttpClient({ fetchImpl });

    await expect(client.request({ url: 'https://x' })).resolves.toBe('clean');
  });

  it('builds a working client from parsed public options', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ body: 'via-options' }));
    const client = clientFromOptions({
      throttle: 5,
      requestOptions: { fetchImpl, retries: 1, timeoutMs: 1000, headers: { 'X-Trace': 'on' } },
    });

    await expect(client.request({ url: 'https://x' })).resolves.toBe('via-options');
    expect(headersOf(fetchImpl)['X-Trace']).toBe('on');
  });

  it('rejects without fetching when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = abortAwareFetch();
    const client = createHttpClient({ fetchImpl, signal: controller.signal });

    const error = await client.request({ url: 'https://x' }).catch((caught: unknown) => caught);

    expect((error as DOMException).name).toBe('AbortError');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('stops retrying when the caller aborts mid flight', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener('abort', () => {
            reject(signal.reason as Error);
          });
        }),
    );
    const client = createHttpClient({ fetchImpl, signal: controller.signal });

    const settled = client.request({ url: 'https://x' }).catch((caught: unknown) => caught);
    controller.abort();

    const error = await settled;
    expect((error as DOMException).name).toBe('AbortError');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('forwards a caller abort to the in flight attempt signal', async () => {
    const controller = new AbortController();
    const reason = { code: 'STOP' };
    let attemptSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          attemptSignal = init?.signal ?? undefined;
          attemptSignal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    const client = createHttpClient({ fetchImpl, signal: controller.signal });

    const settled = client.request({ url: 'https://x' }).catch((caught: unknown) => caught);
    expect(attemptSignal?.aborted).toBe(false);
    controller.abort(reason);

    expect(attemptSignal?.aborted).toBe(true);
    expect(attemptSignal?.reason).toBe(reason);
    await expect(settled).resolves.toBe(reason);
  });

  it('stops forwarding to an attempt signal once the attempt has settled', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ body: 'ok' }));
    const client = createHttpClient({ fetchImpl, signal: controller.signal });

    await expect(client.request({ url: 'https://x' })).resolves.toBe('ok');

    const settledSignal = lastInit(fetchImpl).signal;
    controller.abort();

    expect(settledSignal?.aborted).toBe(false);
  });

  it('rejects with the caller reason even when fetchImpl ignores the signal', async () => {
    const controller = new AbortController();
    const reason = { code: 'STOP' };
    let deliver: (() => void) | undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          deliver = () => {
            resolve(fakeResponse({ body: 'late body' }));
          };
        }),
    );
    const { events, hooks } = recordingHooks();
    const client = createHttpClient({ fetchImpl, signal: controller.signal, ...hooks });

    const settled = client.request({ url: 'https://x' }).catch((caught: unknown) => caught);
    await vi.waitFor(() => {
      expect(deliver).toBeDefined();
    });
    controller.abort(reason);
    deliver?.();

    await expect(settled).resolves.toBe(reason);
    expect(events.map((event) => event.kind)).toEqual(['request', 'response']);
  });

  it('retries a per attempt timeout and reports it as the HttpError cause', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    const client = createHttpClient({ fetchImpl, timeoutMs: 50, retries: 1 });

    const settled = client.request({ url: 'https://x' }).catch((caught: unknown) => caught);
    await vi.runAllTimersAsync();
    const error = await settled;

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).cause).toMatchObject({ name: 'TimeoutError' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('threads the signal from public request options', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = abortAwareFetch();
    const client = clientFromOptions({
      requestOptions: { fetchImpl, signal: controller.signal },
    });

    const error = await client.request({ url: 'https://x' }).catch((caught: unknown) => caught);

    expect((error as DOMException).name).toBe('AbortError');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('settles an abort during a network error backoff', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network down'));
    const client = createHttpClient({ fetchImpl, signal: controller.signal });

    const settled = client.request({ url: 'https://x' }).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    controller.abort();
    await vi.runAllTimersAsync();

    const error = await settled;
    expect((error as DOMException).name).toBe('AbortError');
    expect(error).not.toBeInstanceOf(HttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('settles an abort during retry backoff before the delay expires', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 500 }));
    const client = createHttpClient({ fetchImpl, signal: controller.signal });

    const settled = client.request({ url: 'https://x' }).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();

    const error = await settled;
    expect((error as DOMException).name).toBe('AbortError');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles an abort during a Retry-After wait without restarting it', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse({ status: 429, headers: { 'Retry-After': '30' } }));
    const client = createHttpClient({ fetchImpl, signal: controller.signal });

    const settled = client.request({ url: 'https://x' }).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    controller.abort();
    await vi.runAllTimersAsync();

    const error = await settled;
    expect((error as DOMException).name).toBe('AbortError');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('releases a limiter reservation on abort without delaying the queue', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const calls: number[] = [];
    const fetchImpl = vi.fn(() => {
      calls.push(Date.now() - start);
      return Promise.resolve(fakeResponse({ body: 'ok' }));
    });
    const limiter = createRateLimiter(1);
    const controller = new AbortController();
    const plain = createHttpClient({ fetchImpl, limiter });
    const cancellable = createHttpClient({ fetchImpl, limiter, signal: controller.signal });

    const first = plain.request({ url: 'https://a' });
    const doomed = cancellable.request({ url: 'https://b' }).catch((caught: unknown) => caught);
    const third = plain.request({ url: 'https://c' });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await vi.runAllTimersAsync();

    await expect(first).resolves.toBe('ok');
    await expect(third).resolves.toBe('ok');
    expect(((await doomed) as DOMException).name).toBe('AbortError');
    expect(calls).toEqual([0, 1000]);
  });

  it('rejects an aborted call queued behind a waiting survivor at the abort', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const calls: number[] = [];
    const fetchImpl = vi.fn(() => {
      calls.push(Date.now() - start);
      return Promise.resolve(fakeResponse({ body: 'ok' }));
    });
    const limiter = createRateLimiter(1);
    const spared = new AbortController();
    const doomed = new AbortController();
    const plain = createHttpClient({ fetchImpl, limiter });
    const survivor = createHttpClient({ fetchImpl, limiter, signal: spared.signal });
    const cancellable = createHttpClient({ fetchImpl, limiter, signal: doomed.signal });

    const first = plain.request({ url: 'https://a' });
    const second = survivor.request({ url: 'https://b' });
    let settledAt = -1;
    const third = cancellable.request({ url: 'https://c' }).catch((caught: unknown) => {
      settledAt = Date.now() - start;
      return caught;
    });
    await vi.advanceTimersByTimeAsync(1);
    doomed.abort();
    await vi.advanceTimersByTimeAsync(1);
    expect(settledAt).toBe(1);
    await vi.runAllTimersAsync();

    await expect(first).resolves.toBe('ok');
    await expect(second).resolves.toBe('ok');
    expect(((await third) as DOMException).name).toBe('AbortError');
    expect(calls).toEqual([0, 1000]);
  });

  it('throws BlockedError for a consent host and for a captcha body', async () => {
    const consentFetch = vi
      .fn()
      .mockResolvedValue(fakeResponse({ body: 'fine', url: 'https://consent.google.com/m' }));
    const consentClient = createHttpClient({ fetchImpl: consentFetch });
    await expect(consentClient.request({ url: 'https://x' })).rejects.toBeInstanceOf(BlockedError);

    const captchaFetch = vi
      .fn()
      .mockResolvedValue(fakeResponse({ body: 'go to www.google.com/recaptcha now' }));
    const captchaClient = createHttpClient({ fetchImpl: captchaFetch });
    await expect(captchaClient.request({ url: 'https://x' })).rejects.toBeInstanceOf(BlockedError);
  });
});

const countingSignal = (
  controller: AbortController,
): { signal: AbortSignal; live: () => number } => {
  const live = new Set<unknown>();
  const target = controller.signal;
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
    live.add(listener);
    add(type as 'abort', listener, options);
  });
  vi.spyOn(target, 'removeEventListener').mockImplementation((type, listener, options) => {
    live.delete(listener);
    remove(type as 'abort', listener, options);
  });
  return { signal: target, live: () => live.size };
};

describe('cancellation cleanup', () => {
  it('leaves no listener on the caller signal after a successful request', async () => {
    const controller = new AbortController();
    const { signal, live } = countingSignal(controller);
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ body: 'ok' }));
    const client = createHttpClient({ fetchImpl, signal });

    await expect(client.request({ url: 'https://x' })).resolves.toBe('ok');

    expect(live()).toBe(0);
  });

  it('leaves no listener and no timer after retry exhaustion', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const controller = new AbortController();
    const { signal, live } = countingSignal(controller);
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 500 }));
    const client = createHttpClient({ fetchImpl, signal });

    const settled = client.request({ url: 'https://x' }).catch((caught: unknown) => caught);
    await vi.runAllTimersAsync();

    expect(await settled).toBeInstanceOf(HttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(live()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no listener behind when the caller aborts mid flight', async () => {
    const controller = new AbortController();
    const { signal, live } = countingSignal(controller);
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    const client = createHttpClient({ fetchImpl, signal });

    const settled = client.request({ url: 'https://x' }).catch((caught: unknown) => caught);
    controller.abort();
    await settled;

    expect(live()).toBe(0);
  });

  it('leaves no listener behind after a queued reservation settles or aborts', async () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter(1);
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ body: 'ok' }));
    const spared = new AbortController();
    const doomed = new AbortController();
    const counted = { spared: countingSignal(spared), doomed: countingSignal(doomed) };
    const plain = createHttpClient({ fetchImpl, limiter });
    const survivor = createHttpClient({ fetchImpl, limiter, signal: counted.spared.signal });
    const cancellable = createHttpClient({ fetchImpl, limiter, signal: counted.doomed.signal });

    const pending = [
      plain.request({ url: 'https://a' }),
      survivor.request({ url: 'https://b' }),
      cancellable.request({ url: 'https://c' }).catch((caught: unknown) => caught),
    ];
    await vi.advanceTimersByTimeAsync(1);
    doomed.abort();
    await vi.runAllTimersAsync();
    await Promise.all(pending);

    expect(counted.spared.live()).toBe(0);
    expect(counted.doomed.live()).toBe(0);
  });

  it('rejects with the caller reason when the body read is aborted', async () => {
    const controller = new AbortController();
    const reason = { code: 'STOP' };
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        url: 'https://play.google.com/store',
        headers: new Headers(),
        text: () =>
          new Promise<string>((_resolve, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error('body read aborted'));
            });
          }),
      } as unknown as Response),
    );
    const client = createHttpClient({ fetchImpl, signal: controller.signal });

    const settled = client.request({ url: 'https://x' }).catch((caught: unknown) => caught);
    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
    controller.abort(reason);

    await expect(settled).resolves.toBe(reason);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives the caller reason precedence over a per attempt timeout', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reason = { code: 'STOP' };
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    const client = createHttpClient({ fetchImpl, signal: controller.signal, timeoutMs: 50 });

    const settled = client.request({ url: 'https://x' }).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort(reason);
    await vi.runAllTimersAsync();

    await expect(settled).resolves.toBe(reason);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a reservation made with an already aborted signal without queueing', async () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter(1);
    const reason = { code: 'STOP' };
    await limiter();
    const queued = limiter();

    const settled = limiter(AbortSignal.abort(reason)).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(0);

    await expect(settled).resolves.toBe(reason);
    await vi.runAllTimersAsync();
    await expect(queued).resolves.toBeUndefined();
  });

  it('hands an abort raised in onRequest to the fetch it precedes', async () => {
    const controller = new AbortController();
    const reason = { code: 'STOP' };
    const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      init?.signal?.aborted
        ? Promise.reject(new Error('aborted'))
        : Promise.resolve(fakeResponse({ body: 'ok' })),
    );
    const client = createHttpClient({
      fetchImpl,
      signal: controller.signal,
      onRequest: () => {
        controller.abort(reason);
      },
    });

    await expect(
      client.request({ url: 'https://x' }).catch((caught: unknown) => caught),
    ).resolves.toBe(reason);
    expect(lastInit(fetchImpl).signal?.reason).toBe(reason);
  });

  it('emits no retry event after an abort raised in onResponse', async () => {
    const controller = new AbortController();
    const reason = { code: 'STOP' };
    const retries: RetryEvent[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 503 }));
    const client = createHttpClient({
      fetchImpl,
      signal: controller.signal,
      onResponse: () => {
        controller.abort(reason);
      },
      onRetry: (event) => {
        retries.push(event);
      },
    });

    const error = await client.request({ url: 'https://x' }).catch((caught: unknown) => caught);

    expect(error).toBe(reason);
    expect(retries).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps survivor throughput when half of a queued burst is aborted', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const calls: number[] = [];
    const fetchImpl = vi.fn(() => {
      calls.push(Date.now() - start);
      return Promise.resolve(fakeResponse({ body: 'ok' }));
    });
    const limiter = createRateLimiter(1);
    const controller = new AbortController();
    const survivors = createHttpClient({ fetchImpl, limiter });
    const doomed = createHttpClient({ fetchImpl, limiter, signal: controller.signal });

    const pending = [
      survivors.request({ url: 'https://a' }),
      doomed.request({ url: 'https://b' }).catch((caught: unknown) => caught),
      survivors.request({ url: 'https://c' }),
      doomed.request({ url: 'https://d' }).catch((caught: unknown) => caught),
      survivors.request({ url: 'https://e' }),
      doomed.request({ url: 'https://f' }).catch((caught: unknown) => caught),
    ];
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await vi.runAllTimersAsync();
    const settled = await Promise.all(pending);

    expect(calls).toEqual([0, 1000, 2000]);
    expect(settled.filter((value) => value === 'ok')).toHaveLength(3);
    for (const index of [1, 3, 5]) {
      expect((settled[index] as DOMException).name).toBe('AbortError');
    }
  });
});

describe('Retry-After handling', () => {
  const JITTER_CEILING_MS = 500;

  const retryAfter = (value: string, extra: Record<string, string> = {}): Response =>
    fakeResponse({ status: 429, headers: { 'Retry-After': value, ...extra } });

  const expectRetryDelay = async (response: Response, delayMs: number): Promise<void> => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValue(fakeResponse({ body: 'ok' }));
    const client = createHttpClient({ fetchImpl });

    const pending = client.request({ url: 'https://x' });
    await vi.advanceTimersByTimeAsync(delayMs - 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(pending).resolves.toBe('ok');
  };

  const expectJitteredFallback = (value: string): Promise<void> =>
    expectRetryDelay(retryAfter(value), JITTER_CEILING_MS);

  const expectTerminal = async (value: string): Promise<void> => {
    const fetchImpl = vi.fn().mockResolvedValue(retryAfter(value));
    const client = createHttpClient({ fetchImpl });

    const error = await client.request({ url: 'https://x' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
  });

  it('honors a delta-seconds value at the cap exactly', async () => {
    await expectRetryDelay(retryAfter('60'), 60000);
  });

  it('honors a zero padded delta-seconds value', async () => {
    await expectRetryDelay(retryAfter('007'), 7000);
  });

  it('honors a zero delta-seconds value as an immediate retry', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(retryAfter('0'))
      .mockResolvedValue(fakeResponse({ body: 'ok' }));
    const client = createHttpClient({ fetchImpl });

    const pending = client.request({ url: 'https://x' });
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(pending).resolves.toBe('ok');
  });

  it('ends the call instead of waiting past the cap', async () => {
    await expectTerminal('120');
  });

  it('ends the call on a value that would overflow setTimeout', async () => {
    await expectTerminal('99999999999');
  });

  it('derives the delay from an http date against the server Date header', async () => {
    await expectRetryDelay(
      retryAfter('Wed, 21 Oct 2026 07:28:05 GMT', { Date: 'Wed, 21 Oct 2026 07:28:00 GMT' }),
      5000,
    );
  });

  it('derives the delay from the local clock when the response carries no Date', async () => {
    vi.setSystemTime(Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'));

    await expectRetryDelay(retryAfter('Wed, 21 Oct 2026 07:28:03 GMT'), 3000);
  });

  it('ends the call on an http date beyond the cap', async () => {
    vi.setSystemTime(Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'));

    await expectTerminal('Wed, 21 Oct 2026 07:29:01 GMT');
  });

  it('falls back to jittered backoff for a past http date', async () => {
    await expectRetryDelay(
      retryAfter('Wed, 21 Oct 2026 07:27:00 GMT', { Date: 'Wed, 21 Oct 2026 07:28:00 GMT' }),
      JITTER_CEILING_MS,
    );
  });

  it('falls back to jittered backoff for an empty header instead of retrying at once', async () => {
    await expectJitteredFallback('');
  });

  it('falls back to jittered backoff for exponential notation', async () => {
    await expectJitteredFallback('1e3');
  });

  it('falls back to jittered backoff for hexadecimal notation', async () => {
    await expectJitteredFallback('0x10');
  });

  it('falls back to jittered backoff for a fractional value', async () => {
    await expectJitteredFallback('1.5');
  });

  it('falls back to jittered backoff for a date shaped value that is not an http date', async () => {
    await expectJitteredFallback('2099-01');
  });

  it('falls back to jittered backoff for a day name that is not a date', async () => {
    await expectJitteredFallback('Mon');
  });
});

type RecordedEvent =
  | { kind: 'request'; attempt: number }
  | { kind: 'response'; attempt: number; status: number; durationMs: number }
  | {
      kind: 'retry';
      attempt: number;
      reason: 'status' | 'network';
      delayMs: number;
      status?: number;
    };

const recordingHooks = (): {
  events: RecordedEvent[];
  hooks: {
    onRequest: (event: RequestEvent) => void;
    onResponse: (event: ResponseEvent) => void;
    onRetry: (event: RetryEvent) => void;
  };
} => {
  const events: RecordedEvent[] = [];
  return {
    events,
    hooks: {
      onRequest: (event) => {
        events.push({ kind: 'request', attempt: event.attempt });
      },
      onResponse: (event) => {
        events.push({
          kind: 'response',
          attempt: event.attempt,
          status: event.status,
          durationMs: event.durationMs,
        });
      },
      onRetry: (event) => {
        events.push({
          kind: 'retry',
          attempt: event.attempt,
          reason: event.reason,
          delayMs: event.delayMs,
          status: event.status,
        });
      },
    },
  };
};

describe('request lifecycle hooks', () => {
  it('emits request then response on a first-try success', async () => {
    const { events, hooks } = recordingHooks();
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ body: 'ok' }));
    const client = createHttpClient({ fetchImpl, ...hooks });

    await expect(client.request({ url: 'https://x' })).resolves.toBe('ok');

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ kind: 'request', attempt: 1 });
    expect(events[1]).toMatchObject({ kind: 'response', attempt: 1, status: 200 });
    expect((events[1] as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(0);
  });

  it('emits a status retry between a 500 and the recovering attempt', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { events, hooks } = recordingHooks();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 500 }))
      .mockResolvedValueOnce(fakeResponse({ body: 'recovered' }));
    const client = createHttpClient({ fetchImpl, ...hooks });

    const pending = client.request({ url: 'https://x' });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe('recovered');

    expect(events.map((event) => event.kind)).toEqual([
      'request',
      'response',
      'retry',
      'request',
      'response',
    ]);
    expect(events[1]).toMatchObject({ status: 500, attempt: 1 });
    expect(events[2]).toMatchObject({ reason: 'status', status: 500, attempt: 1 });
    expect(events[3]).toEqual({ kind: 'request', attempt: 2 });
    expect(events[4]).toMatchObject({ status: 200, attempt: 2 });
  });

  it('reports the Retry-After delay in the retry event', async () => {
    vi.useFakeTimers();
    const { events, hooks } = recordingHooks();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 429, headers: { 'Retry-After': '3' } }))
      .mockResolvedValueOnce(fakeResponse({ body: 'ok' }));
    const client = createHttpClient({ fetchImpl, ...hooks });

    const pending = client.request({ url: 'https://x' });
    await vi.runAllTimersAsync();
    await pending;

    const retry = events.find((event) => event.kind === 'retry');
    expect(retry).toMatchObject({ reason: 'status', status: 429, delayMs: 3000 });
  });

  it('emits a network retry without a status when fetch rejects', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { events, hooks } = recordingHooks();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(fakeResponse({ body: 'ok' }));
    const client = createHttpClient({ fetchImpl, ...hooks });

    const pending = client.request({ url: 'https://x' });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe('ok');

    expect(events.map((event) => event.kind)).toEqual(['request', 'retry', 'request', 'response']);
    expect(events[1]).toEqual({ kind: 'retry', attempt: 1, reason: 'network', delayMs: 0 });
  });

  it('emits one response per attempt and one retry per scheduled sleep when exhausted', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { events, hooks } = recordingHooks();
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 500 }));
    const client = createHttpClient({ fetchImpl, ...hooks });

    const settled = client.request({ url: 'https://x' }).catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const error = await settled;

    expect(error).toBeInstanceOf(HttpError);
    expect(events.filter((event) => event.kind === 'request')).toHaveLength(3);
    expect(events.filter((event) => event.kind === 'response')).toHaveLength(3);
    expect(events.filter((event) => event.kind === 'retry')).toHaveLength(2);
    expect(events.map((event) => event.kind)).toEqual([
      'request',
      'response',
      'retry',
      'request',
      'response',
      'retry',
      'request',
      'response',
    ]);
  });

  it('emits the response before BlockedError propagates for a consent wall', async () => {
    const { events, hooks } = recordingHooks();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse({ body: 'fine', url: 'https://consent.google.com/m' }));
    const client = createHttpClient({ fetchImpl, ...hooks });

    await expect(client.request({ url: 'https://x' })).rejects.toBeInstanceOf(BlockedError);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ kind: 'response', status: 200, attempt: 1 });
  });

  it('emits no retry event when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { events, hooks } = recordingHooks();
    const fetchImpl = abortAwareFetch();
    const client = createHttpClient({ fetchImpl, signal: controller.signal, ...hooks });

    const error = await client.request({ url: 'https://x' }).catch((caught: unknown) => caught);

    expect((error as DOMException).name).toBe('AbortError');
    expect(events).toEqual([]);
  });

  it('swallows throwing and rejecting hooks without changing the request', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const retries: RetryEvent[] = [];
    const onRequest = vi.fn(() => {
      throw new Error('sync hook failure');
    });
    const onResponseMock = vi.fn(() => Promise.reject(new Error('async hook failure')));
    const onResponse = onResponseMock as unknown as OnResponse;
    const onRetry = (event: RetryEvent): void => {
      retries.push(event);
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 500 }))
      .mockResolvedValueOnce(fakeResponse({ body: 'recovered' }));
    const client = createHttpClient({ fetchImpl, onRequest, onResponse, onRetry });

    const pending = client.request({ url: 'https://x' });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe('recovered');

    expect(onRequest).toHaveBeenCalledTimes(2);
    expect(onResponseMock).toHaveBeenCalledTimes(2);
    expect(retries).toHaveLength(1);
  });

  it('threads lifecycle hooks from public request options', async () => {
    const { events, hooks } = recordingHooks();
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ body: 'ok' }));
    const client = clientFromOptions({ requestOptions: { fetchImpl, ...hooks } });

    await client.request({ url: 'https://x' });

    expect(events.map((event) => event.kind)).toEqual(['request', 'response']);
  });
});
