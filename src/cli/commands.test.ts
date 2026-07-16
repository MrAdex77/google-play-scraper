import { describe, expect, it } from 'vitest';
import { sort } from '../constants.js';
import { ValidationError } from '../core/errors.js';
import { commands } from './commands.js';
import type { CliApi, CliCommand, CliValues } from './commands.js';

interface RecordedCall {
  method: string;
  options: unknown;
}

const API_METHODS = [
  'app',
  'apps',
  'search',
  'suggest',
  'list',
  'developer',
  'similar',
  'reviews',
  'permissions',
  'datasafety',
  'categories',
  'availability',
] as const;

function createStubApi(result: unknown = { stub: true }): { api: CliApi; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const api = Object.fromEntries(
    API_METHODS.map((method) => [
      method,
      (options: unknown) => {
        calls.push({ method, options });
        return Promise.resolve(result);
      },
    ]),
  ) as unknown as CliApi;
  return { api, calls };
}

function getCommand(name: string): CliCommand {
  const command = commands.find((entry) => entry.name === name);
  if (command === undefined) {
    throw new Error(`missing command ${name}`);
  }
  return command;
}

async function run(
  name: string,
  positional: string,
  values: CliValues = {},
): Promise<RecordedCall> {
  const { api, calls } = createStubApi();
  await getCommand(name).execute(positional, values, api);
  const call = calls[0];
  if (call === undefined) {
    throw new Error(`command ${name} did not call the api`);
  }
  return call;
}

describe('command dispatch', () => {
  const cases: { name: string; positional: string; values?: CliValues; expected: object }[] = [
    { name: 'app', positional: 'com.example', expected: { appId: 'com.example' } },
    {
      name: 'apps',
      positional: 'com.a, com.b,com.c',
      expected: { appIds: ['com.a', 'com.b', 'com.c'] },
    },
    { name: 'search', positional: 'panda', expected: { term: 'panda' } },
    { name: 'suggest', positional: 'panda', expected: { term: 'panda' } },
    { name: 'list', positional: '', expected: {} },
    { name: 'developer', positional: 'DevCo', expected: { devId: 'DevCo' } },
    { name: 'similar', positional: 'com.example', expected: { appId: 'com.example' } },
    { name: 'reviews', positional: 'com.example', expected: { appId: 'com.example' } },
    { name: 'permissions', positional: 'com.example', expected: { appId: 'com.example' } },
    { name: 'datasafety', positional: 'com.example', expected: { appId: 'com.example' } },
    { name: 'categories', positional: '', expected: {} },
    {
      name: 'availability',
      positional: 'com.example',
      values: { countries: 'us' },
      expected: { appId: 'com.example', countries: ['us'] },
    },
  ];

  it('covers every command in the table', () => {
    expect(cases.map((entry) => entry.name).sort()).toEqual(
      commands.map((command) => command.name).sort(),
    );
  });

  it.each(cases)('$name calls exactly its api function', async ({ name, positional, values }) => {
    const call = await run(name, positional, values ?? {});
    expect(call.method).toBe(name);
  });

  it.each(cases)(
    '$name maps the positional into the right field',
    async ({ name, positional, values, expected }) => {
      const call = await run(name, positional, values ?? {});
      expect(call.options).toMatchObject(expected);
    },
  );

  it.each(commands.map((command) => ({ name: command.name })))(
    '$name forwards the base trio',
    async ({ name }) => {
      const values: CliValues = { lang: 'de', country: 'de', throttle: '2' };
      if (name === 'availability') {
        values.countries = 'us';
      }
      const call = await run(name, 'com.example', values);
      expect(call.options).toMatchObject({ lang: 'de', country: 'de', throttle: 2 });
    },
  );
});

describe('flag mapping', () => {
  it('maps --full-detail to fullDetail true', async () => {
    const call = await run('search', 'panda', { 'full-detail': true });
    expect(call.options).toMatchObject({ fullDetail: true });
  });

  it('maps a missing --full-detail to fullDetail false', async () => {
    const call = await run('search', 'panda');
    expect(call.options).toMatchObject({ fullDetail: false });
  });

  it('maps --token to nextPaginationToken', async () => {
    const call = await run('reviews', 'com.example', { token: 'abc' });
    expect(call.options).toMatchObject({ nextPaginationToken: 'abc' });
  });

  it('coerces --num to a number', async () => {
    const call = await run('search', 'panda', { num: '5' });
    expect(call.options).toMatchObject({ num: 5 });
  });

  it('coerces a garbage --num to NaN for the feature schema to reject', async () => {
    const call = await run('search', 'panda', { num: 'abc' });
    expect(call.options).toMatchObject({ num: Number.NaN });
  });

  it('coerces --concurrency to a number', async () => {
    const call = await run('apps', 'com.a', { concurrency: '3' });
    expect(call.options).toMatchObject({ concurrency: 3 });
  });
});

describe('sort mapping', () => {
  it.each([
    { name: 'newest', value: sort.NEWEST },
    { name: 'rating', value: sort.RATING },
    { name: 'helpfulness', value: sort.HELPFULNESS },
  ])('maps --sort $name to the sort constant', async ({ name, value }) => {
    const call = await run('reviews', 'com.example', { sort: name });
    expect(call.options).toMatchObject({ sort: value });
  });

  it('rejects an unknown sort name listing the valid choices', () => {
    const { api } = createStubApi();
    expect(() => getCommand('reviews').execute('com.example', { sort: 'banana' }, api)).toThrow(
      'sort must be one of newest, rating, helpfulness',
    );
  });
});

describe('list choices', () => {
  it('accepts known collection, category and age names', async () => {
    const call = await run('list', '', {
      collection: 'TOP_PAID',
      category: 'GAME_ACTION',
      age: 'AGE_RANGE1',
    });
    expect(call.options).toMatchObject({
      collection: 'TOP_PAID',
      category: 'GAME_ACTION',
      age: 'AGE_RANGE1',
    });
  });

  it('rejects an unknown collection listing the valid choices', () => {
    const { api } = createStubApi();
    const attempt = (): Promise<unknown> =>
      getCommand('list').execute('', { collection: 'TOP_BANANA' }, api);
    expect(attempt).toThrow(ValidationError);
    expect(attempt).toThrow('collection must be one of TOP_FREE, TOP_PAID, GROSSING');
  });

  it('rejects an unknown price listing the valid choices', () => {
    const { api } = createStubApi();
    expect(() => getCommand('search').execute('panda', { price: 'cheap' }, api)).toThrow(
      'price must be one of all, free, paid',
    );
  });
});

describe('availability countries', () => {
  it('splits, trims and lowercases the country list', async () => {
    const call = await run('availability', 'com.example', { countries: 'us, PL ,de' });
    expect(call.options).toMatchObject({ countries: ['us', 'pl', 'de'] });
  });

  it('rejects a missing --countries', () => {
    const { api } = createStubApi();
    expect(() => getCommand('availability').execute('com.example', {}, api)).toThrow(
      ValidationError,
    );
  });
});
