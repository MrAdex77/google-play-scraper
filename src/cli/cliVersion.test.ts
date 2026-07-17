import { describe, expect, it, vi } from 'vitest';
import { runCli } from './cli.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => Promise.reject(new Error('ENOENT'))),
}));

describe('runCli --version without a readable package.json', () => {
  it('returns 1 with a clean message instead of rejecting', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(['--version'], {
      out: (text) => {
        out.push(text);
      },
      err: (text) => {
        err.push(text);
      },
    });
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err.join('')).toContain('unable to locate package.json');
  });
});
