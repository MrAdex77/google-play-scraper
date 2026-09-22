import * as z from 'zod/mini';
import {
  buildClientSurface,
  type GooglePlayClient,
  type GooglePlayIterators,
  type Passthrough,
} from './clientSurface.js';
import { clientFromOptions, createRateLimiter, type ResolveClient } from './core/http.js';
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
});

export type ClientOptions = z.input<typeof clientOptionsSchema>;

export interface ClientDefaults {
  lang?: string;
  country?: string;
}

type ParsedClientOptions = z.infer<typeof clientOptionsSchema>;

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
