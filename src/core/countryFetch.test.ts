import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCountryFetch } from './countryFetch.js';
import { ValidationError } from './errors.js';
import { clientFromOptions } from './http.js';

const fetchMock = (body: string) => vi.fn(() => Promise.resolve(new Response(body)));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createCountryFetch', () => {
  it('routes to the matching country fetch based on the gl query param', async () => {
    const us = fetchMock('us');
    const de = fetchMock('de');
    const routed = createCountryFetch({ perCountry: { us, de } });

    const response = await routed('https://play.google.com/store/apps/details?id=x&gl=de');

    expect(await response.text()).toBe('de');
    expect(de).toHaveBeenCalledOnce();
    expect(us).not.toHaveBeenCalled();
  });

  it('matches countries case insensitively in both settings and url', async () => {
    const fr = fetchMock('fr');
    const routed = createCountryFetch({ perCountry: { FR: fr } });

    const response = await routed('https://play.google.com/store/search?q=x&gl=Fr');

    expect(await response.text()).toBe('fr');
    expect(fr).toHaveBeenCalledOnce();
  });

  it('uses the fallback when the url carries no gl param', async () => {
    const us = fetchMock('us');
    const fallback = fetchMock('fallback');
    const routed = createCountryFetch({ perCountry: { us }, fallback });

    const response = await routed('https://play.google.com/_/PlayStoreUi/data/batchexecute?hl=en');

    expect(await response.text()).toBe('fallback');
    expect(us).not.toHaveBeenCalled();
  });

  it('uses the fallback for a country without a route', async () => {
    const us = fetchMock('us');
    const fallback = fetchMock('fallback');
    const routed = createCountryFetch({ perCountry: { us }, fallback });

    const response = await routed('https://play.google.com/store/search?q=x&gl=jp');

    expect(await response.text()).toBe('fallback');
    expect(us).not.toHaveBeenCalled();
  });

  it('uses the fallback for an unparseable url', async () => {
    const us = fetchMock('us');
    const fallback = fetchMock('fallback');
    const routed = createCountryFetch({ perCountry: { us }, fallback });

    const response = await routed('not a url gl=us');

    expect(await response.text()).toBe('fallback');
    expect(us).not.toHaveBeenCalled();
  });

  it('falls back to the global fetch when no fallback is configured', async () => {
    const globalFetch = fetchMock('global');
    vi.stubGlobal('fetch', globalFetch);
    const routed = createCountryFetch({ perCountry: { us: fetchMock('us') } });

    const response = await routed('https://play.google.com/store/search?q=x&gl=jp');

    expect(await response.text()).toBe('global');
    expect(globalFetch).toHaveBeenCalledOnce();
  });

  it('extracts the country from Request and URL inputs', async () => {
    const de = fetchMock('de');
    const routed = createCountryFetch({ perCountry: { de } });

    await routed(new URL('https://play.google.com/store/search?q=x&gl=de'));
    await routed(new Request('https://play.google.com/store/search?q=x&gl=DE'));

    expect(de).toHaveBeenCalledTimes(2);
  });

  it('forwards the init argument to the routed fetch', async () => {
    const us = fetchMock('us');
    const routed = createCountryFetch({ perCountry: { us } });
    const init: RequestInit = { method: 'POST', body: 'f.req=x' };

    await routed('https://play.google.com/_/PlayStoreUi/data/batchexecute?gl=us', init);

    expect(us).toHaveBeenCalledWith(
      'https://play.google.com/_/PlayStoreUi/data/batchexecute?gl=us',
      init,
    );
  });

  it('composes with the http client through the fetchImpl seam', async () => {
    const us = fetchMock('routed body');
    const client = clientFromOptions({
      requestOptions: { fetchImpl: createCountryFetch({ perCountry: { us } }) },
    });

    const body = await client.request({ url: 'https://play.google.com/store/search?q=x&gl=us' });

    expect(body).toBe('routed body');
    expect(us).toHaveBeenCalledOnce();
  });

  it('rejects country codes that are not two letters', () => {
    expect(() => createCountryFetch({ perCountry: { usa: fetchMock('usa') } })).toThrow(
      ValidationError,
    );
  });

  it('rejects country codes that collide ignoring case', () => {
    expect(() =>
      createCountryFetch({ perCountry: { us: fetchMock('a'), US: fetchMock('b') } }),
    ).toThrow(ValidationError);
  });

  it('rejects route values that are not functions', () => {
    const settings = { perCountry: { us: 'http://proxy.example:8080' } };
    expect(() => createCountryFetch(settings as never)).toThrow(ValidationError);
  });
});
