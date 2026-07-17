import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { liveDescribe } from './helpers.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

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
      { cwd: REPO_ROOT, encoding: 'utf8' },
      (error, stdout, stderr) => {
        const exitCode = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolve({ exitCode, stdout, stderr });
      },
    );
  });
}

liveDescribe('cli', () => {
  it('app prints the app detail as JSON and exits 0', async () => {
    const { exitCode, stdout } = await runCliProcess(['app', 'com.google.android.apps.translate']);
    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(stdout);
    expect(parsed).toMatchObject({ appId: 'com.google.android.apps.translate' });
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
