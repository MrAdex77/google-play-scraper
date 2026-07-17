import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { liveDescribe } from './helpers.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const TRANSLATE_ID = 'com.google.android.apps.translate';
const INSTAGRAM_ID = 'com.instagram.android';
const GEO_GAME_ID = 'com.adex77.WhereAmI';
const MISSING_ID = 'com.adex77.definitely.not.a.real.app';
const GOOGLE_DEV_ID = '5700313618786177705';

const CLI_PROCESS_TIMEOUT_MS = 30000;

interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCliProcess(args: readonly string[]): Promise<CliRun> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', 'src/cli/main.ts', ...args],
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: CLI_PROCESS_TIMEOUT_MS },
      (error, stdout, stderr) => {
        const exitCode = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolve({ exitCode, stdout, stderr });
      },
    );
  });
}

async function runCliJson(args: readonly string[]): Promise<unknown> {
  const { exitCode, stdout } = await runCliProcess(args);
  expect(exitCode).toBe(0);
  return JSON.parse(stdout) as unknown;
}

liveDescribe('cli', () => {
  it('app prints the app detail as JSON and exits 0', async () => {
    const { exitCode, stdout } = await runCliProcess(['app', TRANSLATE_ID]);
    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(stdout);
    expect(parsed).toMatchObject({ appId: TRANSLATE_ID });
    expect(parsed).toHaveProperty('title', expect.any(String));
    const detail = parsed as { title: string };
    expect(detail.title.length).toBeGreaterThan(0);
  });

  it('app exits 1 for a missing app and mentions not found on stderr', async () => {
    const { exitCode, stdout, stderr } = await runCliProcess([
      'app',
      'com.an.app.that.does.not.exist.xyz',
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr.toLowerCase()).toContain('not found');
  });

  it('suggest prints a JSON array and exits 0', async () => {
    const { exitCode, stdout } = await runCliProcess(['suggest', 'panda', '--country', 'us']);
    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    const suggestions = parsed as string[];
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(typeof suggestion).toBe('string');
    }
  });

  it('search respects --num and every result carries an appId', async () => {
    const { exitCode, stdout } = await runCliProcess(['search', 'panda', '--num', '3']);
    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    const results = parsed as { appId?: string }[];
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
    for (const result of results) {
      expect(typeof result.appId).toBe('string');
    }
  });
});

liveDescribe('cli commands against live google play', () => {
  it('apps fetches a batch in order with fulfilled entries', async () => {
    const parsed = await runCliJson([
      'apps',
      `${TRANSLATE_ID},${INSTAGRAM_ID}`,
      '--concurrency',
      '2',
    ]);
    const entries = parsed as { appId: string; status: string; app?: { appId: string } }[];
    expect(entries.map((entry) => entry.appId)).toEqual([TRANSLATE_ID, INSTAGRAM_ID]);
    for (const entry of entries) {
      expect(entry.status).toBe('fulfilled');
      expect(entry.app?.appId).toBe(entry.appId);
    }
  });

  it('apps reports a missing id as rejected without failing the batch', async () => {
    const parsed = await runCliJson(['apps', `${TRANSLATE_ID},${MISSING_ID}`]);
    const entries = parsed as { appId: string; status: string }[];
    expect(entries[0]?.status).toBe('fulfilled');
    expect(entries[1]?.status).toBe('rejected');
    expect(entries[1]?.appId).toBe(MISSING_ID);
  });

  it('list returns the requested number of free games', async () => {
    const parsed = await runCliJson([
      'list',
      '--collection',
      'TOP_FREE',
      '--category',
      'GAME',
      '--num',
      '5',
    ]);
    const items = parsed as { appId: string; free: boolean; price: number }[];
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.appId.length).toBeGreaterThan(0);
      expect(item.free).toBe(true);
      expect(item.price).toBe(0);
    }
  });

  it('developer lists google apps for the numeric dev id', async () => {
    const parsed = await runCliJson(['developer', GOOGLE_DEV_ID, '--num', '10']);
    const items = parsed as { appId: string; developer: string }[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.developer).toContain('Google');
    }
  });

  it('similar excludes the source app', async () => {
    const parsed = await runCliJson(['similar', GEO_GAME_ID]);
    const items = parsed as { appId: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.appId === GEO_GAME_ID)).toBe(false);
  });

  it('similar exits 1 for a missing app because it is an html surface', async () => {
    const { exitCode, stdout, stderr } = await runCliProcess(['similar', MISSING_ID]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr.toLowerCase()).toContain('not found');
  });

  it('reviews accumulates exactly --num reviews with valid scores', async () => {
    const parsed = await runCliJson(['reviews', TRANSLATE_ID, '--num', '5', '--sort', 'rating']);
    const result = parsed as { data: { id: string; score: number }[] };
    expect(result.data).toHaveLength(5);
    for (const review of result.data) {
      expect(review.id.length).toBeGreaterThan(0);
      expect(review.score).toBeGreaterThanOrEqual(1);
      expect(review.score).toBeLessThanOrEqual(5);
    }
  });

  it('reviews resumes from a --token onto a different page', async () => {
    const first = (await runCliJson(['reviews', TRANSLATE_ID, '--paginate'])) as {
      data: { id: string }[];
      nextPaginationToken: string | null;
    };
    expect(first.data.length).toBeGreaterThan(0);
    expect(first.nextPaginationToken).not.toBeNull();
    const second = (await runCliJson([
      'reviews',
      TRANSLATE_ID,
      '--paginate',
      '--token',
      first.nextPaginationToken ?? '',
    ])) as { data: { id: string }[] };
    expect(second.data.length).toBeGreaterThan(0);
    expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
  });

  it('permissions --short prints plain permission strings', async () => {
    const parsed = await runCliJson(['permissions', TRANSLATE_ID, '--short']);
    const names = parsed as string[];
    expect(names.length).toBeGreaterThan(3);
    for (const name of names) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('permissions prints an empty array for a missing app and exits 0', async () => {
    const { exitCode, stdout, stderr } = await runCliProcess(['permissions', MISSING_ID]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual([]);
  });

  it('datasafety reports collected data and a privacy policy url', async () => {
    const parsed = await runCliJson(['datasafety', TRANSLATE_ID]);
    const report = parsed as {
      collectedData: { data: string }[];
      securityPractices: { practice: string }[];
      privacyPolicyUrl?: string;
    };
    expect(report.collectedData.length).toBeGreaterThan(0);
    expect(report.securityPractices.length).toBeGreaterThan(0);
    expect(report.privacyPolicyUrl?.startsWith('http')).toBe(true);
  });

  it('datasafety prints an empty report for a missing app and exits 0', async () => {
    const parsed = await runCliJson(['datasafety', MISSING_ID]);
    const report = parsed as Record<string, unknown>;
    expect(report.sharedData).toEqual([]);
    expect(report.collectedData).toEqual([]);
    expect(report.securityPractices).toEqual([]);
    expect(report).not.toHaveProperty('privacyPolicyUrl');
  });

  it('categories prints the taxonomy including GAME and APPLICATION', async () => {
    const parsed = await runCliJson(['categories']);
    const ids = parsed as string[];
    expect(ids.length).toBeGreaterThan(30);
    expect(ids).toContain('GAME');
    expect(ids).toContain('APPLICATION');
    for (const id of ids) {
      expect(id).toMatch(/^[A-Z_0-9]+$/);
    }
  });

  it('availability reports the canonical app available in us and pl', async () => {
    const parsed = await runCliJson([
      'availability',
      GEO_GAME_ID,
      '--countries',
      'us,PL',
      '--concurrency',
      '2',
    ]);
    const result = parsed as {
      appId: string;
      countries: Record<string, { status: string } | undefined>;
    };
    expect(result.appId).toBe(GEO_GAME_ID);
    expect(result.countries.us?.status).toBe('available');
    expect(result.countries.pl?.status).toBe('available');
  });

  it('app honors --lang and --country', async () => {
    const parsed = await runCliJson(['app', TRANSLATE_ID, '--lang', 'de', '--country', 'de']);
    const detail = parsed as { appId: string; title: string };
    expect(detail.appId).toBe(TRANSLATE_ID);
    expect(detail.title.length).toBeGreaterThan(0);
  });

  it('search --full-detail returns results carrying full app fields', async () => {
    const parsed = await runCliJson(['search', 'panda', '--num', '1', '--full-detail']);
    const results = parsed as { appId: string; description?: string }[];
    expect(results).toHaveLength(1);
    expect(results[0]?.appId.length).toBeGreaterThan(0);
    expect(results[0]?.description?.length).toBeGreaterThan(0);
  });
});

describe('cli process contract', () => {
  it('--help exits 0 and lists the commands', async () => {
    const { exitCode, stdout, stderr } = await runCliProcess(['--help']);
    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    for (const name of ['app', 'search', 'reviews', 'availability', 'datasafety']) {
      expect(stdout).toContain(name);
    }
  });

  it('--version exits 0 and prints the package version', async () => {
    const raw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
    const { version } = JSON.parse(raw) as { version: string };
    const { exitCode, stdout } = await runCliProcess(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${version}\n`);
  });

  it('an unknown command exits 2 and prints usage on stderr', async () => {
    const { exitCode, stdout, stderr } = await runCliProcess(['frobnicate']);
    expect(exitCode).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('unknown command "frobnicate"');
    expect(stderr).toContain('Usage: google-play-scraper <command>');
  });

  it('an unknown flag exits 2 and prints the command usage', async () => {
    const { exitCode, stdout, stderr } = await runCliProcess(['app', 'com.example', '--nope']);
    expect(exitCode).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('Usage: google-play-scraper app <appId>');
  });

  it('a missing required positional exits 2 without touching the network', async () => {
    const { exitCode, stdout, stderr } = await runCliProcess(['app']);
    expect(exitCode).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('missing required argument');
  });

  it('a garbage --num exits 2 with the validation message', async () => {
    const { exitCode, stdout, stderr } = await runCliProcess(['search', 'panda', '--num', 'abc']);
    expect(exitCode).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('num');
  });

  it('a missing --countries exits 2 with the usage line', async () => {
    const { exitCode, stderr } = await runCliProcess(['availability', 'com.example']);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('--countries is required');
    expect(stderr).toContain('Usage: google-play-scraper availability <appId>');
  });
});
