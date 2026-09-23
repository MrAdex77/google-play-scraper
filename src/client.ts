import * as z from 'zod/mini';
import {
  buildClientSurface,
  type GooglePlayClient,
  type GooglePlayIterators,
  type Passthrough,
} from './clientSurface.js';
import type { OnDegradation } from './core/degradation.js';
import { clientFromOptions, createRateLimiter, type ResolveClient } from './core/http.js';
import type { OnIntegrityEvent } from './core/integrity.js';
import {
  parseOptions,
  requestOptionsSchema,
  type MethodWrapper,
  type RequestOptions,
} from './core/options.js';

export const clientOptionsSchema = z.object({
  lang: z.optional(z.string().check(z.minLength(2), z.maxLength(7))),
  country: z.optional(z.string().check(z.length(2))),
  throttle: z.optional(z.number().check(z.positive(), z.lte(50))),
  requestOptions: z.optional(requestOptionsSchema),
  onDegradation: z.optional(z.custom<OnDegradation>((value) => typeof value === 'function')),
  onIntegrityEvent: z.optional(z.custom<OnIntegrityEvent>((value) => typeof value === 'function')),
});

export type ClientOptions = z.input<typeof clientOptionsSchema>;

type ParsedClientOptions = z.infer<typeof clientOptionsSchema>;

export type ClientDefaults = Pick<
  ParsedClientOptions,
  'lang' | 'country' | 'onDegradation' | 'onIntegrityEvent'
>;

export type ApplyDefaults = <Options extends object>(options: Options) => Options & ClientDefaults;

export interface SharedTransport {
  resolveClient: ResolveClient;
  applyDefaults: ApplyDefaults;
}

const CLIENT_CONTEXT = 'client';

function mergeRequestOptions(
  base: RequestOptions | undefined,
  override: RequestOptions | undefined,
): RequestOptions | undefined {
  if (base === undefined || override === undefined) {
    return override ?? base;
  }
  return { ...base, ...override };
}

export function createSharedTransport(parsed: ParsedClientOptions): SharedTransport {
  const limiter = parsed.throttle !== undefined ? createRateLimiter(parsed.throttle) : undefined;

  const resolveClient: ResolveClient = (opts) =>
    clientFromOptions({
      limiter,
      throttle: opts.throttle,
      requestOptions: mergeRequestOptions(parsed.requestOptions, opts.requestOptions),
    });

  const applyDefaults: ApplyDefaults = (options) => {
    const given: ClientDefaults = options;
    return {
      ...options,
      lang: given.lang ?? parsed.lang,
      country: given.country ?? parsed.country,
      onDegradation: given.onDegradation ?? parsed.onDegradation,
      onIntegrityEvent: given.onIntegrityEvent ?? parsed.onIntegrityEvent,
    };
  };

  return { resolveClient, applyDefaults };
}

export function createClient(options?: ClientOptions): GooglePlayClient & GooglePlayIterators {
  const parsed = parseOptions(clientOptionsSchema, options ?? {}, CLIENT_CONTEXT);
  const { resolveClient, applyDefaults } = createSharedTransport(parsed);
  const passthrough: Passthrough = (fn) => (callOptions) => fn(applyDefaults(callOptions));
  const cached: MethodWrapper = (_name, _schema, fn) => passthrough(fn);

  return buildClientSurface({ resolveClient, cached, passthrough });
}
