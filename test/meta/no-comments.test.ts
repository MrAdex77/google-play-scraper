import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../../src', import.meta.url));

const lineCommentToken = '/'.repeat(2);
const blockCommentToken = '/'.concat('*');

const listTypeScriptFiles = (): string[] =>
  readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => join(sourceRoot, entry));

const findViolations = (filePath: string): string[] => {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const violations: string[] = [];
  lines.forEach((line, index) => {
    if (line.trim().startsWith(lineCommentToken) || line.includes(blockCommentToken)) {
      violations.push(`${filePath}:${(index + 1).toString()}`);
    }
  });
  return violations;
};

describe('no comments source policy', () => {
  it('finds no comment tokens in any src TypeScript file', () => {
    const violations = listTypeScriptFiles().flatMap(findViolations);
    expect(violations, `comment tokens found:\n${violations.join('\n')}`).toEqual([]);
  });
});
