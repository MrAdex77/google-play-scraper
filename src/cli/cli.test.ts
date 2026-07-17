import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { GooglePlayError, NotFoundError } from '../core/errors.js';
import { runCli } from './cli.js';
import { commands } from './commands.js';
import type { CliApi } from './commands.js';

interface RecordedIo {
  io: { out: (text: string) => void; err: (text: string) => void };
  stdout: () => string;
  stderr: () => string;
}

function createIo(): RecordedIo {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      out: (text) => {
        out.push(text);
      },
      err: (text) => {
        err.push(text);
      },
    },
    stdout: () => out.join(''),
    stderr: () => err.join(''),
  };
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

function createStubApi(result: unknown = { stub: true }): {
  api: CliApi;
  calls: { method: string; options: unknown }[];
} {
  const calls: { method: string; options: unknown }[] = [];
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

describe('runCli success path', () => {
  it('prints the pretty JSON result with a trailing newline and returns 0', async () => {
    const value = { appId: 'com.example', title: 'Example' };
    const { api } = createStubApi(value);
    const { io, stdout, stderr } = createIo();
    const code = await runCli(['app', 'com.example'], io, api);
    expect(code).toBe(0);
    expect(stdout()).toBe(`${JSON.stringify(value, null, 2)}\n`);
    expect(stderr()).toBe('');
  });

  it('dispatches the positional and flags through to the api', async () => {
    const { api, calls } = createStubApi();
    const { io } = createIo();
    await runCli(['reviews', 'com.example', '--sort', 'rating', '--num', '20'], io, api);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('reviews');
    expect(calls[0]?.options).toMatchObject({ appId: 'com.example', num: 20, sort: 3 });
  });
});

describe('runCli scrape failures', () => {
  it('returns 1 and writes the message to stderr on NotFoundError', async () => {
    const { api } = createStubApi();
    api.app = () =>
      Promise.reject(new NotFoundError('App not found (404)', 404, 'https://example.com'));
    const { io, stdout, stderr } = createIo();
    const code = await runCli(['app', 'com.example'], io, api);
    expect(code).toBe(1);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('App not found (404)');
  });

  it('returns 1 for a plain GooglePlayError with its message on stderr', async () => {
    const { api } = createStubApi();
    api.search = () => Promise.reject(new GooglePlayError('rate limited by google play'));
    const { io, stdout, stderr } = createIo();
    const code = await runCli(['search', 'panda'], io, api);
    expect(code).toBe(1);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('rate limited by google play');
  });

  it('returns 1 and stringifies a non-Error rejection', async () => {
    const { api } = createStubApi();
    const rejection = 'boom' as unknown as Error;
    api.app = () => Promise.reject(rejection);
    const { io, stdout, stderr } = createIo();
    const code = await runCli(['app', 'com.example'], io, api);
    expect(code).toBe(1);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('boom');
  });
});

describe('runCli usage errors', () => {
  it('returns 2 for an unknown command and prints the help', async () => {
    const { api } = createStubApi();
    const { io, stdout, stderr } = createIo();
    const code = await runCli(['frobnicate'], io, api);
    expect(code).toBe(2);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('unknown command "frobnicate"');
    expect(stderr()).toContain('Usage: google-play-scraper <command>');
  });

  it('returns 2 for an unknown flag and prints the command usage', async () => {
    const { api } = createStubApi();
    const { io, stderr } = createIo();
    const code = await runCli(['app', 'com.example', '--nope'], io, api);
    expect(code).toBe(2);
    expect(stderr()).toContain('google-play-scraper:');
    expect(stderr()).toContain('Usage: google-play-scraper app <appId>');
  });

  it('returns 2 for a missing required positional and prints the usage', async () => {
    const { api, calls } = createStubApi();
    const { io, stderr } = createIo();
    const code = await runCli(['app'], io, api);
    expect(code).toBe(2);
    expect(calls).toEqual([]);
    expect(stderr()).toContain('missing required argument');
    expect(stderr()).toContain('Usage: google-play-scraper app <appId>');
  });

  it('returns 2 for an unexpected extra positional and names it', async () => {
    const { api, calls } = createStubApi();
    const { io, stderr } = createIo();
    const code = await runCli(['app', 'com.example', 'com.stray'], io, api);
    expect(code).toBe(2);
    expect(calls).toEqual([]);
    expect(stderr()).toContain('unexpected argument "com.stray"');
    expect(stderr()).toContain('Usage: google-play-scraper app <appId>');
  });

  it('returns 2 when a command that takes no positional receives one', async () => {
    const { api, calls } = createStubApi();
    const { io, stderr } = createIo();
    const code = await runCli(['list', 'com.example'], io, api);
    expect(code).toBe(2);
    expect(calls).toEqual([]);
    expect(stderr()).toContain('unexpected argument "com.example"');
  });

  it('returns 2 with no arguments at all and prints the help to stderr', async () => {
    const { api } = createStubApi();
    const { io, stdout, stderr } = createIo();
    const code = await runCli([], io, api);
    expect(code).toBe(2);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('Usage: google-play-scraper <command>');
  });

  it('surfaces a feature ValidationError for a garbage --num as exit 2', async () => {
    const { io, stdout, stderr } = createIo();
    const code = await runCli(['search', 'panda', '--num', 'abc'], io);
    expect(code).toBe(2);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('num');
    expect(stderr()).toContain('Usage: google-play-scraper search <term>');
  });

  it('returns 2 for an unknown sort naming the valid choices', async () => {
    const { api } = createStubApi();
    const { io, stderr } = createIo();
    const code = await runCli(['reviews', 'com.example', '--sort', 'banana'], io, api);
    expect(code).toBe(2);
    expect(stderr()).toContain('sort must be one of newest, rating, helpfulness');
  });

  it('returns 2 for a missing --countries and prints the usage line', async () => {
    const { api } = createStubApi();
    const { io, stderr } = createIo();
    const code = await runCli(['availability', 'com.example'], io, api);
    expect(code).toBe(2);
    expect(stderr()).toContain('--countries is required');
    expect(stderr()).toContain('Usage: google-play-scraper availability <appId>');
  });

  it('returns 2 when a string flag is missing its value', async () => {
    const { api, calls } = createStubApi();
    const { io, stderr } = createIo();
    const code = await runCli(['search', 'panda', '--num'], io, api);
    expect(code).toBe(2);
    expect(calls).toEqual([]);
    expect(stderr()).toContain('Usage: google-play-scraper search <term>');
  });

  it('surfaces a feature ValidationError for a garbage --throttle as exit 2', async () => {
    const { io, stdout, stderr } = createIo();
    const code = await runCli(['app', 'com.example', '--throttle', 'abc'], io);
    expect(code).toBe(2);
    expect(stdout()).toBe('');
    expect(stderr()).toContain('throttle');
  });

  it('surfaces a feature ValidationError for a negative --num as exit 2', async () => {
    const { io, stderr } = createIo();
    const code = await runCli(['search', 'panda', '--num', '-5'], io);
    expect(code).toBe(2);
    expect(stderr()).toContain('num');
  });

  it('surfaces the feature ValidationError for an empty apps list as exit 2', async () => {
    const { io, stderr } = createIo();
    const code = await runCli(['apps', ','], io);
    expect(code).toBe(2);
    expect(stderr()).toContain('appIds');
  });

  it('surfaces the feature ValidationError for duplicate countries as exit 2', async () => {
    const { io, stderr } = createIo();
    const code = await runCli(['availability', 'com.example', '--countries', 'us,US'], io);
    expect(code).toBe(2);
    expect(stderr()).toContain('unique');
  });

  it('surfaces the feature ValidationError for a malformed country code as exit 2', async () => {
    const { io, stderr } = createIo();
    const code = await runCli(['availability', 'com.example', '--countries', 'usa'], io);
    expect(code).toBe(2);
    expect(stderr()).toContain('countries');
  });

  it('returns 2 for an unknown --collection naming the valid choices', async () => {
    const { api, calls } = createStubApi();
    const { io, stderr } = createIo();
    const code = await runCli(['list', '--collection', 'TOP_BANANA'], io, api);
    expect(code).toBe(2);
    expect(calls).toEqual([]);
    expect(stderr()).toContain('collection must be one of TOP_FREE, TOP_PAID, GROSSING');
  });

  it('returns 2 for an unknown --price naming the valid choices', async () => {
    const { api } = createStubApi();
    const { io, stderr } = createIo();
    const code = await runCli(['search', 'panda', '--price', 'cheap'], io, api);
    expect(code).toBe(2);
    expect(stderr()).toContain('price must be one of all, free, paid');
  });
});

describe('runCli parsing details', () => {
  it('lets the last repeated flag value win', async () => {
    const { api, calls } = createStubApi();
    const { io } = createIo();
    const code = await runCli(['search', 'panda', '--num', '5', '--num', '7'], io, api);
    expect(code).toBe(0);
    expect(calls[0]?.options).toMatchObject({ num: 7 });
  });

  it('treats arguments after -- as positionals', async () => {
    const { api, calls } = createStubApi();
    const { io } = createIo();
    const code = await runCli(['app', '--', 'com.example'], io, api);
    expect(code).toBe(0);
    expect(calls[0]?.options).toMatchObject({ appId: 'com.example' });
  });

  it('accepts the --flag=value form', async () => {
    const { api, calls } = createStubApi();
    const { io } = createIo();
    const code = await runCli(['search', 'panda', '--num=9', '--country=de'], io, api);
    expect(code).toBe(0);
    expect(calls[0]?.options).toMatchObject({ num: 9, country: 'de' });
  });

  it('keeps a multi-word quoted term as one positional', async () => {
    const { api, calls } = createStubApi();
    const { io } = createIo();
    const code = await runCli(['search', 'sleep tracker'], io, api);
    expect(code).toBe(0);
    expect(calls[0]?.options).toMatchObject({ term: 'sleep tracker' });
  });
});

describe('runCli global flags', () => {
  it('--help lists every command from the table and returns 0', async () => {
    const { api } = createStubApi();
    const { io, stdout, stderr } = createIo();
    const code = await runCli(['--help'], io, api);
    expect(code).toBe(0);
    expect(stderr()).toBe('');
    for (const command of commands) {
      expect(stdout()).toContain(command.name);
    }
  });

  it('<command> --help prints that command usage and returns 0', async () => {
    const { api, calls } = createStubApi();
    const { io, stdout } = createIo();
    const code = await runCli(['search', '--help'], io, api);
    expect(code).toBe(0);
    expect(calls).toEqual([]);
    expect(stdout()).toContain('Usage: google-play-scraper search <term>');
  });

  it('-h prints the global help and returns 0', async () => {
    const { api } = createStubApi();
    const { io, stdout } = createIo();
    const code = await runCli(['-h'], io, api);
    expect(code).toBe(0);
    expect(stdout()).toContain('Usage: google-play-scraper <command>');
  });

  it('<command> -h prints that command usage and returns 0', async () => {
    const { api, calls } = createStubApi();
    const { io, stdout } = createIo();
    const code = await runCli(['app', 'com.example', '-h'], io, api);
    expect(code).toBe(0);
    expect(calls).toEqual([]);
    expect(stdout()).toContain('Usage: google-play-scraper app <appId>');
  });

  it('--version prints the exact version from package.json and returns 0', async () => {
    const raw = await readFile(new URL('../../package.json', import.meta.url), 'utf8');
    const { version } = JSON.parse(raw) as { version: string };
    const { api } = createStubApi();
    const { io, stdout } = createIo();
    const code = await runCli(['--version'], io, api);
    expect(code).toBe(0);
    expect(stdout()).toBe(`${version}\n`);
  });
});
