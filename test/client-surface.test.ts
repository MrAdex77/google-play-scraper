import { describe, expect, it } from 'vitest';
import gplay, { createClient, memoized } from '../src/index.js';

const FACTORY_ONLY_MEMBERS = ['createClient', 'memoized'];
const CACHED_ONLY_MEMBERS = ['cache'];

const memberNames = (surface: object): string[] => Object.keys(surface).sort();

describe('client surface parity', () => {
  it('exposes the same members on the default export and a shared client', () => {
    const expected = memberNames(gplay).filter((name) => !FACTORY_ONLY_MEMBERS.includes(name));

    expect(memberNames(createClient())).toEqual(expected);
  });

  it('exposes the shared client surface plus cache controls on a cached client', () => {
    const expected = memberNames({ ...createClient(), cache: undefined });

    expect(memberNames(memoized())).toEqual(expected);
    expect(CACHED_ONLY_MEMBERS.every((name) => name in memoized())).toBe(true);
  });
});
