import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { appIdSchema, baseOptionsSchema, parseOptions } from './options.ts';
import { ValidationError } from './errors.ts';

describe('parseOptions', () => {
  it('fills defaults for lang and country', () => {
    const parsed = parseOptions(baseOptionsSchema, {}, 'listApps');

    expect(parsed.lang).toBe('en');
    expect(parsed.country).toBe('us');
  });

  it('keeps provided values over defaults', () => {
    const parsed = parseOptions(baseOptionsSchema, { lang: 'pl', country: 'pl' }, 'listApps');

    expect(parsed.lang).toBe('pl');
    expect(parsed.country).toBe('pl');
  });

  it('rejects a one character country with a ValidationError naming the field', () => {
    const act = (): unknown => parseOptions(baseOptionsSchema, { country: 'u' }, 'listApps');

    expect(act).toThrow(ValidationError);
    expect(act).toThrow(/country/);
    expect(act).toThrow(/listApps/);
  });

  it('accepts request options carrying a fetch implementation', () => {
    const parsed = parseOptions(
      baseOptionsSchema,
      { requestOptions: { fetchImpl: fetch, retries: 3 } },
      'listApps',
    );

    expect(parsed.requestOptions?.retries).toBe(3);
    expect(parsed.requestOptions?.fetchImpl).toBe(fetch);
  });

  it('rejects a non function fetch implementation', () => {
    const act = (): unknown =>
      parseOptions(baseOptionsSchema, { requestOptions: { fetchImpl: 42 } }, 'listApps');

    expect(act).toThrow(ValidationError);
  });

  it('accepts an abort signal in request options', () => {
    const controller = new AbortController();
    const parsed = parseOptions(
      baseOptionsSchema,
      { requestOptions: { signal: controller.signal } },
      'listApps',
    );

    expect(parsed.requestOptions?.signal).toBe(controller.signal);
  });

  it('rejects a value that is not an abort signal', () => {
    const act = (): unknown =>
      parseOptions(baseOptionsSchema, { requestOptions: { signal: {} } }, 'listApps');

    expect(act).toThrow(ValidationError);
  });

  it('accepts a function as the degradation callback', () => {
    const onDegradation = (): void => undefined;
    const parsed = parseOptions(baseOptionsSchema, { onDegradation }, 'listApps');

    expect(parsed.onDegradation).toBe(onDegradation);
  });

  it('rejects a non function degradation callback naming the field', () => {
    const act = (): unknown => parseOptions(baseOptionsSchema, { onDegradation: 42 }, 'listApps');

    expect(act).toThrow(ValidationError);
    expect(act).toThrow(/onDegradation/);
  });

  it('parses the degradation callback to undefined when omitted', () => {
    const parsed = parseOptions(baseOptionsSchema, {}, 'listApps');

    expect(parsed.onDegradation).toBeUndefined();
  });

  it('accepts a function as the integrity callback', () => {
    const onIntegrityEvent = (): void => undefined;
    const parsed = parseOptions(baseOptionsSchema, { onIntegrityEvent }, 'listApps');

    expect(parsed.onIntegrityEvent).toBe(onIntegrityEvent);
  });

  it('rejects a non function integrity callback naming the field', () => {
    const act = (): unknown =>
      parseOptions(baseOptionsSchema, { onIntegrityEvent: 42 }, 'listApps');

    expect(act).toThrow(ValidationError);
    expect(act).toThrow(/onIntegrityEvent/);
  });

  it('parses the integrity callback to undefined when omitted', () => {
    const parsed = parseOptions(baseOptionsSchema, {}, 'listApps');

    expect(parsed.onIntegrityEvent).toBeUndefined();
  });

  it('accepts the three lifecycle hooks in request options', () => {
    const onRequest = (): void => undefined;
    const onResponse = (): void => undefined;
    const onRetry = (): void => undefined;
    const parsed = parseOptions(
      baseOptionsSchema,
      { requestOptions: { onRequest, onResponse, onRetry } },
      'listApps',
    );

    expect(parsed.requestOptions?.onRequest).toBe(onRequest);
    expect(parsed.requestOptions?.onResponse).toBe(onResponse);
    expect(parsed.requestOptions?.onRetry).toBe(onRetry);
  });

  it('rejects non function lifecycle hooks naming the field', () => {
    for (const field of ['onRequest', 'onResponse', 'onRetry']) {
      const act = (): unknown =>
        parseOptions(baseOptionsSchema, { requestOptions: { [field]: 42 } }, 'listApps');

      expect(act).toThrow(ValidationError);
      expect(act).toThrow(new RegExp(field));
    }
  });
});

describe('appIdSchema', () => {
  const schema = z.object({ appId: appIdSchema });
  const parseAppId = (appId: unknown): unknown => parseOptions(schema, { appId }, 'app');

  it.each([
    'com.whatsapp',
    'com.adex77.WhereAmI',
    'com.Pocketpair.NeverGrave',
    'com.pid.preserve_complete',
    'COM.WHATSAPP',
    'a.b',
    'sixpack.absworkout.bellyfatworkout.abdominalworkout.sixpack_in_seven_days',
  ])('accepts the package name %s', (appId) => {
    expect(parseAppId(appId)).toEqual({ appId });
  });

  it.each([
    '',
    'a',
    'com',
    'com.',
    '.com',
    'com..app',
    ' com.whatsapp',
    'com.whatsapp ',
    'com.whatsapp\n',
    'com.what sapp',
    'com.whatsapp&hl=de',
    'com.whatsapp#frag',
    'com.whatsapp/../com.spotify.music',
    'com.whatsapp"',
    'com.whatsapp%',
    'com.whatsapp\\',
    'com.my-app',
    'com.\u017c\u00f3\u0142w.app',
    'com.whatsapp\u4e2d\u6587',
    '1com.app',
    'com.1app',
    '_com.app',
  ])('rejects the malformed id %j', (appId) => {
    const act = (): unknown => parseAppId(appId);

    expect(act).toThrow(ValidationError);
    expect(act).toThrow(/^app: appId: must be an Android package name/);
  });

  it.each([42, null, undefined, ['com.whatsapp']])('rejects the non string value %j', (appId) => {
    expect(() => parseAppId(appId)).toThrow(ValidationError);
  });

  it('accepts exactly 255 characters and rejects 256 with a length message', () => {
    const longest = `com.${'a'.repeat(251)}`;

    expect(parseAppId(longest)).toEqual({ appId: longest });
    expect(() => parseAppId(`${longest}a`)).toThrow('app: appId: must be at most 255 characters');
  });

  it('reports both problems for an overlong id without a separator', () => {
    expect(() => parseAppId('x'.repeat(300))).toThrow(
      /must be at most 255 characters; appId: must be an Android package name/,
    );
  });
});
