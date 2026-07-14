import { afterEach, describe, expect, it, vi } from 'vitest';
import { availability } from './availability.js';
import { availabilityResultSchema } from './schema.js';
import { createCountryFetch } from '../../core/countryFetch.js';
import { ValidationError } from '../../core/errors.js';

const urlOf = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const glOf = (input: string | URL | Request): string | null =>
  new URL(urlOf(input)).searchParams.get('gl');

interface FakeResponseInit {
  status?: number;
  url?: string;
  body?: string;
}

const fakeResponse = (init: FakeResponseInit = {}): Response => {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    url: init.url ?? 'https://play.google.com/store/apps/details',
    headers: new Headers(),
    text: () => Promise.resolve(init.body ?? ''),
  } as unknown as Response;
};

const statusByCountry = (statuses: Record<string, number>): typeof fetch => {
  const impl: typeof fetch = (input) => {
    const gl = glOf(input) ?? '';
    return Promise.resolve(fakeResponse({ status: statuses[gl] ?? 200 }));
  };
  return impl;
};

describe('availability', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps 200, 404 and other statuses to available, unavailable and error', async () => {
    const result = await availability({
      appId: 'com.example.app',
      countries: ['us', 'gb', 'de'],
      requestOptions: { fetchImpl: statusByCountry({ us: 200, gb: 404, de: 500 }), retries: 0 },
    });

    expect(result.appId).toBe('com.example.app');
    expect(result.countries.us).toEqual({ status: 'available' });
    expect(result.countries.gb).toEqual({ status: 'unavailable' });
    const de = result.countries.de;
    expect(de?.status).toBe('error');
    if (de?.status === 'error') {
      expect(de.message).toContain('500');
    }
  });

  it('reports a consent wall as error, never as unavailable', async () => {
    const consentFetch: typeof fetch = () =>
      Promise.resolve(fakeResponse({ status: 200, url: 'https://consent.google.com/m' }));

    const result = await availability({
      appId: 'com.example.app',
      countries: ['fr'],
      requestOptions: { fetchImpl: consentFetch, retries: 0 },
    });

    const fr = result.countries.fr;
    expect(fr?.status).toBe('error');
    if (fr?.status === 'error') {
      expect(fr.message).toMatch(/Blocked/);
    }
  });

  it('matches country codes case-insensitively and returns them lowercase', async () => {
    const result = await availability({
      appId: 'com.example.app',
      countries: ['US', 'De'],
      requestOptions: { fetchImpl: statusByCountry({ us: 200, de: 404 }), retries: 0 },
    });

    expect(Object.keys(result.countries).sort()).toEqual(['de', 'us']);
    expect(result.countries.us).toEqual({ status: 'available' });
    expect(result.countries.de).toEqual({ status: 'unavailable' });
  });

  it('rejects duplicate, malformed and empty country lists', async () => {
    await expect(
      availability({ appId: 'com.example.app', countries: ['US', 'us'] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      availability({ appId: 'com.example.app', countries: ['usa'] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(availability({ appId: 'com.example.app', countries: [] })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('honors the concurrency ceiling', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl: typeof fetch = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return fakeResponse({ status: 200 });
    };
    const countries = Array.from({ length: 12 }, (_unused, index) => {
      const first = String.fromCharCode(97 + Math.floor(index / 5));
      const second = String.fromCharCode(97 + (index % 5));
      return `${first}${second}`;
    });

    await availability({
      appId: 'com.example.app',
      countries,
      concurrency: 3,
      requestOptions: { fetchImpl, retries: 0 },
    });

    expect(peak).toBe(3);
  });

  it('routes each country through its own fetch via createCountryFetch', async () => {
    const usCalls: string[] = [];
    const plCalls: string[] = [];
    const usFetch: typeof fetch = (input) => {
      usCalls.push(glOf(input) ?? '');
      return Promise.resolve(fakeResponse({ status: 200 }));
    };
    const plFetch: typeof fetch = (input) => {
      plCalls.push(glOf(input) ?? '');
      return Promise.resolve(fakeResponse({ status: 200 }));
    };
    const fetchImpl = createCountryFetch({ perCountry: { us: usFetch, pl: plFetch } });

    const result = await availability({
      appId: 'com.example.app',
      countries: ['us', 'pl'],
      requestOptions: { fetchImpl, retries: 0 },
    });

    expect(usCalls).toEqual(['us']);
    expect(plCalls).toEqual(['pl']);
    expect(result.countries.us).toEqual({ status: 'available' });
    expect(result.countries.pl).toEqual({ status: 'available' });
  });

  it('returns exactly the requested countries under the result schema', async () => {
    const result = await availability({
      appId: 'com.example.app',
      countries: ['us', 'jp'],
      requestOptions: { fetchImpl: statusByCountry({ us: 200, jp: 404 }), retries: 0 },
    });

    expect(availabilityResultSchema.safeParse(result).success).toBe(true);
    expect(Object.keys(result.countries).sort()).toEqual(['jp', 'us']);
  });
});
