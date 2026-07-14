import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as api from '../src/index.js';

const exampleSource = readFileSync(new URL('../examples/all-methods.ts', import.meta.url), 'utf8');

const functionExports = Object.entries(api)
  .filter(([name, value]) => name !== 'default' && typeof value === 'function')
  .map(([name]) => name);

describe('examples/all-methods.ts', () => {
  it.each(functionExports)('demonstrates %s', (name) => {
    expect(exampleSource).toContain(name);
  });
});
