import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
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
});
