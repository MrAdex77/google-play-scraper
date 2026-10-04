import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDeveloper, developer, type DeveloperOptions } from './developer.ts';
import { developerAppSchema, type DeveloperApp } from './schema.ts';
import { developerUrl } from './specs.ts';
import { app } from '../app/app.ts';
import type { App } from '../app/schema.ts';
import type { IntegrityEvent, OnIntegrityEvent } from '../../core/integrity.ts';
import type { DegradationEvent, OnDegradation } from '../../core/degradation.ts';
import { ParseError, SpecError, ValidationError } from '../../core/errors.ts';

const readFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../test/fixtures/developer/${name}`, import.meta.url)),
    'utf8',
  );

const googleHtml = readFixture('google.html');
const mojangHtml = readFixture('mojang.html');
const whatsappAppHtml = readFileSync(
  fileURLToPath(new URL('../../../test/fixtures/app/whatsapp.html', import.meta.url)),
  'utf8',
);
const googleContinuation = readFixture('google-continuation.txt');
const googleNameHtml = readFixture('google-name.html');
const googleNameContinuation = readFixture('google-name-continuation.txt');
const nullContinuation = readFixture('null-continuation.txt');

const GOOGLE_NUMERIC_ID = '5700313618786177705';
const GOOGLE_NAME = 'Google LLC';
const NUMERIC_FIRST_PAGE = 10;
const NUMERIC_CONTINUATION = 100;
const NAME_FIRST_PAGE = 20;
const NAME_CONTINUATION = 70;

const fetchReturning = (body: string): typeof fetch => {
  const impl: typeof fetch = () => Promise.resolve(new Response(body, { status: 200 }));
  return impl;
};

const sequenceFetch = (bodies: string[]): { fetchImpl: typeof fetch; count: () => number } => {
  let index = 0;
  const impl: typeof fetch = () => {
    const body = bodies[Math.min(index, bodies.length - 1)] ?? '';
    index += 1;
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { fetchImpl: impl, count: () => index };
};

const appListItem = (id: string): unknown[] => {
  const item: unknown[] = [];
  item[2] = `App ${id}`;
  item[12] = [id];
  item[9] = [null, null, null, null, [null, null, `/store/apps/details?id=${id}`]];
  item[1] = [null, [[null, null, null, [null, null, `https://icon.example/${id}`]]]];
  item[4] = [[[`Dev ${id}`]], [null, [null, [null, `Summary of ${id}`]]]];
  item[6] = [[null, null, [null, ['4.5', 4.5]]]];
  return item;
};

const framedBatch = (payload: unknown): string => {
  const frame = [['wrb.fr', 'qnKhOb', JSON.stringify(payload), null, null, null, 'generic']];
  const json = JSON.stringify(frame);
  return `)]}'\n\n${json.length.toString()}\n${json}`;
};

const developerBatch = (ids: string[], nextToken: string | null): string => {
  const clusterNode: unknown[] = [];
  clusterNode[0] = ids.map((id) => appListItem(id));
  clusterNode[7] = [null, nextToken];
  const wrap: unknown[] = [];
  wrap[6] = clusterNode;
  return framedBatch([wrap]);
};

const buildDsThree = (data: unknown): string =>
  `<script>AF_initDataCallback({key: 'ds:3', hash: '1', data:${JSON.stringify(data)}, sideChannel: {}});</script>`;

const pricelessNameCore = (id: string): unknown[] => {
  const core: unknown[] = [];
  core[0] = [id];
  core[1] = [null, null, null, [null, null, `https://icon.example/${id}`]];
  core[3] = `App ${id}`;
  core[10] = [null, null, null, null, [null, null, `/store/apps/details?id=${id}`]];
  core[14] = `Dev ${id}`;
  return core;
};

const namePageHtml = (ids: string[]): string => {
  const section: unknown[] = [];
  section[22] = [ids.map((id) => [pricelessNameCore(id)])];
  return buildDsThree([[null, [section]]]);
};

describe('developer degraded pages', () => {
  it('parses a priceless name page item as costing zero', async () => {
    const items = (await developer({
      devId: 'Adex77',
      requestOptions: { fetchImpl: fetchReturning(namePageHtml(['com.adex77.WhereAmI'])) },
    })) as DeveloperApp[];

    expect(items).toHaveLength(1);
    expect(items[0]?.appId).toBe('com.adex77.WhereAmI');
    expect(items[0]?.price).toBe(0);
    expect(items[0]?.free).toBe(false);
    expect(items[0]?.currency).toBeUndefined();
    expect(items[0]?.score).toBeUndefined();
  });

  it('throws a SpecError naming url when the link cell is missing', async () => {
    const core = pricelessNameCore('com.adex77.WhereAmI');
    core[10] = null;
    const section: unknown[] = [];
    section[22] = [[[core]]];
    const html = buildDsThree([[null, [section]]]);

    let thrown: unknown;
    try {
      await developer({ devId: 'Adex77', requestOptions: { fetchImpl: fetchReturning(html) } });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SpecError);
    const failedFields = (thrown as SpecError).failures.map((failure) => failure.field);
    expect(failedFields).toContain('url');
  });

  it('falls back to the name layout when a numeric dev page serves it instead', async () => {
    const items = (await developer({
      devId: '7502834977667077022',
      requestOptions: { fetchImpl: fetchReturning(namePageHtml(['com.adex77.WhereAmI'])) },
    })) as DeveloperApp[];

    expect(items).toHaveLength(1);
    expect(items[0]?.appId).toBe('com.adex77.WhereAmI');
  });

  it('returns an empty list when the developer page carries no apps', async () => {
    const items = (await developer({
      devId: '5700313618786177705',
      requestOptions: { fetchImpl: fetchReturning(buildDsThree([[]])) },
    })) as DeveloperApp[];

    expect(items).toEqual([]);
  });

  it('returns an empty list from a valid empty developer layout', async () => {
    const items = (await developer({
      devId: 'Adex77',
      requestOptions: { fetchImpl: fetchReturning(namePageHtml([])) },
    })) as DeveloperApp[];

    expect(items).toEqual([]);
  });

  it('rejects a malformed matching developer layout', async () => {
    const section: unknown[] = [];
    section[22] = 'not-a-layout';

    await expect(
      developer({
        devId: 'Adex77',
        requestOptions: { fetchImpl: fetchReturning(buildDsThree([[null, [section]]])) },
      }),
    ).rejects.toBeInstanceOf(ParseError);
  });
});

describe('developer url selection', () => {
  it('routes an all-digit devId through the numeric dev path', () => {
    const url = developerUrl('5700313618786177705', 'en', 'us');
    expect(url).toContain('/store/apps/dev?');
    expect(url).not.toContain('/store/apps/developer?');
    expect(url).toContain('id=5700313618786177705');
  });

  it('routes a name devId through the developer path with encoding', () => {
    expect(developerUrl('Mojang', 'en', 'us')).toContain('/store/apps/developer?id=Mojang');
    expect(developerUrl('DO Global', 'en', 'us')).toContain('id=DO+Global');
  });
});

describe('developer id round trip', () => {
  it.each([
    ['WhatsApp LLC', 'id=WhatsApp+LLC'],
    ['Fourth Enterprises, LLC', 'id=Fourth+Enterprises%2C+LLC'],
    ['H&M', 'id=H%26M'],
    ['Moon+', 'id=Moon%2B'],
    ['A+ Federal Credit Union', 'id=A%2B+Federal+Credit+Union'],
    ['100% Pure', 'id=100%25+Pure'],
    ['Danfoss A/S', 'id=Danfoss+A%2FS'],
    ['The Pokémon Company', 'id=The+Pok%C3%A9mon+Company'],
  ])('encodes the name %s as one query value', (name, expectedQuery) => {
    const url = developerUrl(name, 'en', 'us');

    expect(url).toContain(`/store/apps/developer?${expectedQuery}&`);
    expect(new URL(url).searchParams.get('id')).toBe(name);
  });

  it('requests the developer page that the app developer link points at', async () => {
    const details = await app({
      appId: 'com.whatsapp',
      requestOptions: { fetchImpl: fetchReturning(whatsappAppHtml) },
    });
    const requested: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      requested.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      return Promise.resolve(new Response(mojangHtml, { status: 200 }));
    };

    await developer({ devId: details.developerId, requestOptions: { fetchImpl } });

    expect(requested).toHaveLength(1);
    expect(new URL(requested[0] ?? '').searchParams.get('id')).toBe('WhatsApp LLC');
    expect(requested[0]).toContain('/store/apps/developer?id=WhatsApp+LLC&');
  });
});

describe('developer fixture parsing', () => {
  it('parses at least twenty validated apps across the numeric fixture and a follow page', async () => {
    const { fetchImpl } = sequenceFetch([
      googleHtml,
      developerBatch(['g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10'], null),
    ]);

    const items = (await developer({
      devId: '5700313618786177705',
      num: 40,
      requestOptions: { fetchImpl },
    })) as DeveloperApp[];

    expect(items.length).toBeGreaterThanOrEqual(20);
    for (const item of items) {
      expect(() => developerAppSchema.parse(item)).not.toThrow();
      expect(new URL(item.url).origin).toBe('https://play.google.com');
    }
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);
  });

  it('parses at least three validated apps from the Mojang name fixture', async () => {
    const items = (await developer({
      devId: 'Mojang',
      requestOptions: { fetchImpl: fetchReturning(mojangHtml) },
    })) as DeveloperApp[];

    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const item of items) {
      expect(() => developerAppSchema.parse(item)).not.toThrow();
    }
    expect(items.map((item) => item.appId)).toContain('com.mojang.minecraftpe');
  });
});

describe('developer pagination', () => {
  it('composes a follow-up page when the initial page carries a token', async () => {
    const { fetchImpl, count } = sequenceFetch([
      googleHtml,
      developerBatch(['x0', 'x1', 'x2'], null),
    ]);

    const items = (await developer({
      devId: '5700313618786177705',
      num: 13,
      requestOptions: { fetchImpl },
    })) as DeveloperApp[];

    expect(count()).toBe(2);
    expect(items).toHaveLength(13);
    expect(items.map((item) => item.appId)).toContain('x0');
  });

  it('skips pagination when the first page already satisfies num', async () => {
    const { fetchImpl, count } = sequenceFetch([googleHtml, developerBatch(['x0'], null)]);

    const items = (await developer({
      devId: '5700313618786177705',
      num: 5,
      requestOptions: { fetchImpl },
    })) as DeveloperApp[];

    expect(count()).toBe(1);
    expect(items).toHaveLength(5);
  });
});

interface RecordedRun {
  items: DeveloperApp[];
  degradations: DegradationEvent[];
  integrity: IntegrityEvent[];
}

const runRecorded = async (devId: string, bodies: string[]): Promise<RecordedRun> => {
  const degradations: DegradationEvent[] = [];
  const integrity: IntegrityEvent[] = [];
  const { fetchImpl } = sequenceFetch(bodies);
  const items = (await developer({
    devId,
    num: 500,
    requestOptions: { fetchImpl },
    onDegradation: (event) => degradations.push(event),
    onIntegrityEvent: (event) => integrity.push(event),
  })) as DeveloperApp[];
  return { items, degradations, integrity };
};

describe('developer recorded continuation layouts', () => {
  it('collects a name developer continuation served in the shared cluster layout', async () => {
    const { items, degradations, integrity } = await runRecorded(GOOGLE_NAME, [
      googleNameHtml,
      googleNameContinuation,
    ]);

    expect(items).toHaveLength(NAME_FIRST_PAGE + NAME_CONTINUATION);
    expect(new Set(items.map((item) => item.appId)).size).toBe(items.length);
    for (const item of items) {
      expect(() => developerAppSchema.parse(item)).not.toThrow();
      expect(item.developer).toBe(GOOGLE_NAME);
    }
    expect(degradations).toEqual([]);
    expect(integrity).toEqual([]);
  });

  it('collects a numeric developer continuation served in the numeric layout', async () => {
    const { items, degradations, integrity } = await runRecorded(GOOGLE_NUMERIC_ID, [
      googleHtml,
      googleContinuation,
    ]);

    expect(items).toHaveLength(NUMERIC_FIRST_PAGE + NUMERIC_CONTINUATION);
    for (const item of items) {
      expect(() => developerAppSchema.parse(item)).not.toThrow();
    }
    expect(degradations).toEqual([]);
    expect(integrity).toEqual([]);
  });

  it('reports an anchor fallback when a numeric developer is served the name layout', async () => {
    const { items, degradations, integrity } = await runRecorded(GOOGLE_NUMERIC_ID, [
      googleHtml,
      googleNameContinuation,
    ]);

    expect(items).toHaveLength(NUMERIC_FIRST_PAGE + NAME_CONTINUATION);
    expect(degradations).toEqual([]);
    expect(integrity).toHaveLength(1);
    expect(integrity[0]?.context).toBe('developer');
    expect(integrity[0]?.reason).toBe('rpc-anchor-fallback');
    expect(integrity[0]?.error.message).toBe(
      'developer: continuation apps resolved at 0.0.0 instead of 0.6.0',
    );
  });

  it('reports an anchor fallback when a name developer is served the numeric layout', async () => {
    const { items, degradations, integrity } = await runRecorded(GOOGLE_NAME, [
      googleNameHtml,
      googleContinuation,
    ]);

    expect(items).toHaveLength(NAME_FIRST_PAGE + NUMERIC_CONTINUATION);
    expect(degradations).toEqual([]);
    expect(integrity).toHaveLength(1);
    expect(integrity[0]?.reason).toBe('rpc-anchor-fallback');
    expect(integrity[0]?.error.message).toBe(
      'developer: continuation apps resolved at 0.6.0 instead of 0.0.0',
    );
  });

  it('keeps the first page without an event when the server ends with a null payload', async () => {
    const { items, degradations, integrity } = await runRecorded(GOOGLE_NUMERIC_ID, [
      googleHtml,
      nullContinuation,
    ]);

    expect(items).toHaveLength(NUMERIC_FIRST_PAGE);
    expect(degradations).toEqual([]);
    expect(integrity).toEqual([]);
  });

  it('degrades with the name layout path when neither layout carries apps', async () => {
    const { items, degradations, integrity } = await runRecorded(GOOGLE_NAME, [
      googleNameHtml,
      framedBatch([[null, null]]),
    ]);

    expect(items).toHaveLength(NAME_FIRST_PAGE);
    expect(integrity).toEqual([]);
    expect(degradations).toHaveLength(1);
    expect(degradations[0]?.reason).toBe('cluster-page-parse');
    expect(degradations[0]?.error.message).toContain('developer continuation apps response');
  });
});

describe('developer options', () => {
  it('rejects a missing devId through validation', async () => {
    await expect(developer({} as DeveloperOptions)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('developer fullDetail', () => {
  it('forwards per-call observability callbacks to each detail lookup', async () => {
    const onDegradation: OnDegradation = () => undefined;
    const onIntegrityEvent: OnIntegrityEvent = () => undefined;
    const received: [unknown, unknown][] = [];
    const detailed = createDeveloper((params) => {
      received.push([params.onDegradation, params.onIntegrityEvent]);
      return Promise.resolve({ appId: params.appId } as App);
    });

    await detailed({
      devId: 'Mojang',
      requestOptions: { fetchImpl: fetchReturning(mojangHtml) },
      fullDetail: true,
      onDegradation,
      onIntegrityEvent,
    });

    expect(received.length).toBeGreaterThan(0);
    for (const pair of received) {
      expect(pair).toEqual([onDegradation, onIntegrityEvent]);
    }
  });

  it('resolves each app through the injected getApp exactly once', async () => {
    const plain = (await developer({
      devId: 'Mojang',
      requestOptions: { fetchImpl: fetchReturning(mojangHtml) },
    })) as DeveloperApp[];

    const requested: string[] = [];
    const detailed = createDeveloper((params) => {
      requested.push(params.appId);
      return Promise.resolve({ appId: params.appId, description: `detail ${params.appId}` } as App);
    });

    const apps = (await detailed({
      devId: 'Mojang',
      fullDetail: true,
      requestOptions: { fetchImpl: fetchReturning(mojangHtml) },
    })) as App[];

    expect(requested).toEqual(plain.map((item) => item.appId));
    expect(apps.every((item) => item.description.startsWith('detail '))).toBe(true);
  });
});
