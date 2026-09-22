import { describe, expect, it } from 'vitest';
import gplay, { createClient } from '../src/index.js';

const FACTORY_ONLY_MEMBERS = ['createClient', 'memoized'];

const memberNames = (surface: object): string[] => Object.keys(surface).sort();

describe('client surface parity', () => {
  it('exposes the same members on the default export and a shared client', () => {
    const expected = memberNames(gplay).filter((name) => !FACTORY_ONLY_MEMBERS.includes(name));

    expect(memberNames(createClient())).toEqual(expected);
  });
});
